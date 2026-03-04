# Pre-Launch Audit: Tracky

> Generated 2026-03-04 | Branch: `fix/critical-bugs-and-perf-optimizations`

---

## Table of Contents

1. [Critical (Must Fix)](#1-critical-must-fix)
2. [Performance](#2-performance)
3. [Error Handling & Resilience](#3-error-handling--resilience)
4. [UX Gaps](#4-ux-gaps)
5. [App Store Readiness](#5-app-store-readiness)
6. [Testing Gaps](#6-testing-gaps)
7. [Security & Privacy](#7-security--privacy)
8. [Code Quality](#8-code-quality)
9. [Quick Wins](#9-quick-wins)

---

## 1. Critical (Must Fix)

### 1.1 No Privacy Policy

- **Impact**: Apple and Google will reject the submission without one.
- **Details**: The app reads calendars, fetches user location, caches GTFS data, and hits third-party APIs (Transitdocs, Amtrak, Open-Meteo). All of this must be disclosed.
- **Action**: Create a privacy policy, host it, and add the URL to App Store / Play Console metadata.

### 1.2 Missing iOS Permission Descriptions

**File**: `app.json`

| Permission | Status |
|---|---|
| Calendar | Described |
| Notifications | Plugin added, **no usage description** |
| Location (via map "show user location") | **Not declared at all** |

- Expo may auto-inject some defaults, but explicit descriptions are safer and required for review.
- Add `NSLocationWhenInUseUsageDescription` to `ios.infoPlist`.

### 1.3 No Crash Reporting Service

- No Sentry, Bugsnag, or Firebase Crashlytics integration.
- The only crash path is `ErrorBoundary.tsx` which asks the user to manually email logs.
- **Action**: Integrate Sentry (`@sentry/react-native`) or equivalent before launch. Without it, production crashes are invisible.

### 1.4 No Fetch Timeouts on Network Requests

**Files**: `services/realtime.ts`, `services/gtfs-sync.ts`, `services/api.ts`

- Every `fetch()` call has no timeout. A hung connection blocks the entire data pipeline indefinitely.
- **Action**: Use `AbortController` with a 15-second timeout on all fetch calls.

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
const res = await fetch(url, { signal: controller.signal });
clearTimeout(timeout);
```

### 1.5 No Retry Logic for Critical Data

**Files**: `services/gtfs-sync.ts`, `services/realtime.ts`

- GTFS zip download (`content.amtrak.com`) and GTFS-RT protobuf fetch (`transitdocs.com`) have zero retry logic.
- A single transient network failure means no schedule data or no live positions.
- **Action**: Add exponential backoff retry (2-3 attempts) for GTFS sync and realtime fetches.

---

## 2. Performance

### 2.1 ModalContext Causes App-Wide Re-renders

**File**: `context/ModalContext.tsx`

- Single monolithic context holds modal stack, visibility flags, navigation functions, and refs.
- Any modal state change re-renders every consumer (MapScreen, all modals, train cards).
- **Fix**: Split into `ModalNavigationContext` (stable functions) and `ModalStateContext` (changing values). Or use `useSyncExternalStore` / Zustand for modal state.

### 2.2 Inline Callbacks in Map Markers

**File**: `screens/MapScreen.tsx` (lines ~681-748)

- `onPress` handlers on station/train markers are created inline every render.
- This defeats React.memo on marker components and forces re-renders of all markers on every region change.
- **Fix**: Hoist callbacks with `useCallback`, pass stable identifiers to markers.

### 2.3 Station Clustering Recalculates on Pan (Not Just Zoom)

**File**: `screens/MapScreen.tsx` (lines ~608-622)

- `stationClusters` useMemo depends on `stations` from `useStations(viewportBounds)` which updates on every pan.
- Clustering only needs to change on zoom level changes.
- **Fix**: Only pass `debouncedLatDelta` (zoom proxy) as the clustering trigger, not the full station list.

### 2.4 useFrequentlyUsed Refetches Every Render

**File**: `hooks/useFrequentlyUsed.ts`

- `refresh` function is not wrapped in `useCallback`, so the `useEffect` that depends on it fires every render.
- Calls `TrainAPIService.getRoutes()` and `getStops()` each time.
- **Fix**: Wrap `refresh` in `useCallback` with `[]` deps.

### 2.5 Unbounded Polling in useStations and useShapes

**Files**: `hooks/useStations.ts` (lines 12-22), `hooks/useShapes.ts` (lines 18-28)

- 500ms `setInterval` polls for GTFS loaded state with no max attempts or timeout.
- If GTFS load fails permanently, these poll forever, draining battery.
- **Fix**: Add a max poll count (e.g., 60 attempts = 30 seconds) then show an error state.

### 2.6 Large Component Files

| File | Size | Concern |
|---|---|---|
| `SettingsModal.tsx` | 55 KB | Should split into subpage components |
| `TwoStationSearch.tsx` | 55 KB | Search logic can be extracted to a hook |
| `train-detail-modal.tsx` | 50 KB | Split into sections (header, stops, weather) |
| `departure-board-modal.tsx` | 36 KB | Extract filter/search into sub-components |
| `ProfileModal.tsx` | 33 KB | Extract stats calculation to a hook |

These aren't runtime performance issues but they slow dev velocity, make code review harder, and increase risk of bugs.

---

## 3. Error Handling & Resilience

### 3.1 Silent `.catch(() => {})` Swallowing Errors

**Files**: `screens/ModalContent.tsx` (lines 88, 97, 100, 164, 227), `services/background-tasks.ts` (line 25), `context/GTFSRefreshContext.tsx` (lines 61, 98)

- At least 7 locations swallow errors with empty catch blocks.
- Failures in train archiving, widget updates, and location service init are invisible.
- **Fix**: Replace with `.catch(e => logger.warn('context', e))` at minimum.

### 3.2 Unhandled Promise in ModalContent

**File**: `screens/ModalContent.tsx` (line 136)

```ts
TrainStorageService.getSavedTrains().then(setSavedTrains);
```

- No `.catch()` — if storage read fails, the promise rejection is unhandled.
- **Fix**: Add `.catch(e => logger.error(...))`.

### 3.3 Realtime Errors Only Surfaced After 3 Failures + 60s Cooldown

**File**: `services/realtime.ts` (lines 12-16)

- Users can see stale train positions for 3+ minutes before any alert appears.
- **Fix**: Show a subtle "Data may be outdated" banner in the UI after 1-2 failures rather than relying solely on `Alert.alert()`.

### 3.4 GTFS Cache Staleness Window Is 7 Days

**File**: `services/gtfs-sync.ts` (lines ~262-279)

- Schedule data can be up to 7 days old before a re-fetch is triggered.
- Amtrak sometimes updates schedules mid-week.
- **Fix**: Reduce to 2-3 days, or check the GTFS feed's `feed_info.txt` for a `feed_end_date`.

### 3.5 Storage Mutex Can Deadlock

**File**: `services/storage.ts` (lines 12-23)

- Lock uses a Promise chain, but if a `.finally()` callback throws, subsequent operations deadlock.
- **Fix**: Wrap the finally block in its own try/catch, or use a battle-tested mutex library.

---

## 4. UX Gaps

### 4.1 No Offline Indicator

**File**: `components/map/MapSettingsPill.tsx` (lines ~94-118)

- Network connectivity is checked but the result is not exposed to the user.
- When offline, trains silently stop updating with no visual feedback.
- **Fix**: Show a small "Offline" chip on the map or in the header when `isConnected === false`.

### 4.2 No Empty State for Departure Board Searches

**File**: `components/ui/departure-board-modal.tsx`

- If a station has no departures (e.g., late at night), the user sees a blank list.
- **Fix**: Add "No upcoming departures at this station" message.

### 4.3 GTFS Refresh Progress Misleading

**File**: `context/GTFSRefreshContext.tsx` (lines ~42-78)

- Progress starts at 0.05 and jumps to 1.0 with no intermediate updates when cache is valid.
- On slow networks, the progress bar sits at 5% indefinitely.
- **Fix**: Add intermediate progress updates during zip download (use `content-length` header for estimate).

### 4.4 Splash-to-Content Transition Not Coordinated

- `expo-splash-screen` hides before GTFS data is loaded, causing a brief flash of empty map.
- **Fix**: Keep splash visible until `gtfsLoaded === true`, then hide with `SplashScreen.hideAsync()`.

### 4.5 No "Stale Data" Indicator

- When realtime data is >30 seconds old (e.g., after backgrounding), train positions are shown at their last known location with no staleness indicator.
- **Fix**: Show a "Last updated X ago" label or dim stale markers.

---

## 5. App Store Readiness

### 5.1 Checklist

| Requirement | Status | Action |
|---|---|---|
| Privacy policy URL | Missing | Create and host |
| iOS location permission string | Missing | Add to `app.json` `ios.infoPlist` |
| iOS notification permission string | Auto-generated | Verify wording |
| App Privacy Manifest (iOS 17+) | Missing | Create `PrivacyInfo.xcprivacy` via Expo config plugin |
| `ITSAppUsesNonExemptEncryption` | Set to `false` | Verify no encryption use |
| App icon (1024x1024) | Present (882 KB) | Optimize size |
| Splash screen | Configured | Good |
| Bundle identifiers | Set | Good |
| Android permissions rationale | Missing from UI | Add in-app explanation before requesting |
| Deep linking routes | Scheme set, no routes | Configure if needed for notifications |

### 5.2 Image Assets Not Optimized

| File | Current Size | Target |
|---|---|---|
| `assets/images/AppIcon.png` | 882 KB | < 200 KB |
| `assets/images/icon.png` | 385 KB | < 100 KB |

- **Fix**: Run through TinyPNG / ImageOptim. These inflate the app bundle.

### 5.3 EAS Build Production Profile

**File**: `eas.json`

- Verify the `production` profile has `autoIncrement: true` for `buildNumber` / `versionCode`.
- Ensure `APP_VARIANT` or similar env vars aren't set to development values.

---

## 6. Testing Gaps

### 6.1 Current Coverage

| Area | Files Tested | Coverage |
|---|---|---|
| Utils (date, time, logger, helpers) | 4 test files | Partial |
| Services (live-activity, widget-data) | 2 test files | Partial |
| Components | 0 test files | **None** |
| Screens | 0 test files | **None** |
| Hooks | 0 test files | **None** |
| Context | 0 test files | **None** |

### 6.2 Critical Untested Paths

| Path | Risk if Broken |
|---|---|
| `services/gtfs-sync.ts` — zip download + parse | App has no schedule data |
| `services/realtime.ts` — protobuf parse + cache | No live train positions |
| `services/storage.ts` — save/load with mutex | Saved trains lost |
| `services/notifications.ts` — scheduling | Silent failures, user misses trains |
| `services/background-tasks.ts` — alert logic | No delay alerts in background |
| `services/api.ts` — train enrichment pipeline | Wrong/missing data shown |
| `utils/gtfs-parser.ts` — CSV parsing (26 KB of logic) | Schedule data corrupted |

### 6.3 Recommended Pre-Launch Test Additions

Priority order:
1. `gtfs-parser.ts` — unit tests for CSV parsing edge cases
2. `realtime.ts` — unit tests for protobuf parsing, cache invalidation
3. `storage.ts` — unit tests for concurrent access, error recovery
4. `api.ts` — integration tests for train enrichment pipeline
5. `notifications.ts` — unit tests for schedule calculation

---

## 7. Security & Privacy

### 7.1 Developer Email Hardcoded in Logger

**File**: `utils/logger.ts` (lines ~236-256)

```ts
Linking.openURL(`mailto:him@jasonxu.me?subject=${subject}&body=${body}`);
```

- Debug logs sent via email could contain trip history, station names, and timing data.
- **Fix**: Use a support email address. Consider whether log contents need to be sanitized.

### 7.2 No Input Validation on External API Data

**Files**: `services/realtime.ts`, `services/api.ts`

- Protobuf and GTFS data from third-party servers is parsed and used without schema validation.
- A malformed response could crash the app or show wrong data.
- **Fix**: Add basic sanity checks (lat/lon in range, timestamps reasonable, required fields present).

### 7.3 Hardcoded Third-Party URLs

| URL | File | Risk |
|---|---|---|
| `https://asm-backend.transitdocs.com/gtfs/amtrak` | `services/realtime.ts` | App breaks if URL changes |
| `https://content.amtrak.com/content/gtfs/GTFS.zip` | `services/gtfs-sync.ts` | App breaks if URL changes |

- **Fix**: Move to a config file or remote config so URLs can be updated without a new app release.

---

## 8. Code Quality

### 8.1 `any` Types

**File**: `services/live-activity.ts` (line 30)

```ts
const activeActivities = new Map<string, any>();
```

- **Fix**: Define a `LiveActivityHandle` type.

### 8.2 Async Constructor Anti-Pattern

**File**: `utils/logger.ts`

```ts
private constructor() { this.loadFromStorage(); } // async, not awaited
```

- First log entries may be lost before async load completes.
- **Fix**: Use a static async factory method or lazy init with `await`.

### 8.3 Dead Code: `ensureCacheDir()`

**File**: `services/gtfs-sync.ts` (lines 55-57)

```ts
async function ensureCacheDir() {
  // No directory check needed; cache is in AsyncStorage
}
```

- **Fix**: Remove the function and all call sites.

### 8.4 Race Condition in Shared Protobuf Fetch

**File**: `services/realtime.ts` (lines ~53-62)

- Module-level `pendingFetch` variable shared across concurrent callers.
- If two callers race to set it, cache could be inconsistent.
- **Fix**: Use a proper singleton pattern with lock.

### 8.5 Notification Scheduling Hardcodes 7 AM

**File**: `services/notifications.ts` (line ~41)

```ts
travelDay.setHours(7, 0, 0, 0);
```

- Not configurable by the user.
- **Fix**: Add a "notification time" setting or use a relative time (e.g., "2 hours before departure").

---

## 9. Quick Wins

These can each be done in under 30 minutes:

| # | Fix | File(s) | Impact |
|---|---|---|---|
| 1 | Add `.catch(e => logger.warn(...))` to all silent catches | Multiple | Debuggability |
| 2 | Add `AbortController` timeout to fetch calls | `realtime.ts`, `gtfs-sync.ts` | Prevents hangs |
| 3 | Wrap `useFrequentlyUsed.refresh` in `useCallback` | `hooks/useFrequentlyUsed.ts` | Stops re-fetch spam |
| 4 | Add max poll count to GTFS loaded checks | `useStations.ts`, `useShapes.ts` | Battery life |
| 5 | Add "No departures" empty state | `departure-board-modal.tsx` | UX |
| 6 | Optimize PNG assets | `assets/images/` | Bundle size |
| 7 | Add `NSLocationWhenInUseUsageDescription` | `app.json` | App Store approval |
| 8 | Remove dead `ensureCacheDir()` | `gtfs-sync.ts` | Cleanliness |
| 9 | Add `.catch()` to orphaned `.then()` | `ModalContent.tsx:136` | Crash prevention |
| 10 | Add offline "last updated" chip to map | `MapSettingsPill.tsx` | User trust |

---

## Priority Summary

| Priority | Items | Estimated Effort |
|---|---|---|
| **P0 — Blockers** | Privacy policy, iOS permissions, crash reporting, fetch timeouts | 1-2 days |
| **P1 — High** | Retry logic, error handling cleanup, ModalContext split, test coverage for critical services | 3-4 days |
| **P2 — Medium** | Offline UX, empty states, stale data indicator, image optimization, notification timing | 2-3 days |
| **P3 — Low** | Component file splitting, dead code removal, type cleanup | 1-2 days |

**Total estimated effort**: ~8-10 days of focused work before a confident launch.
