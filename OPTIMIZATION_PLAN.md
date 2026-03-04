# Tracky Optimization Plan

Comprehensive audit of the codebase identifying bloat, dead code, bugs, duplication, and architectural improvements.

---

## 1. Dead Code Removal

### 1a. Delete orphaned files
| File | Lines | Reason |
|------|-------|--------|
| `services/train-activity-manager.ts` | 175 | Never imported anywhere in the codebase |
| `types/gtfs-schemas.ts` | 117 | Zod schemas never imported; runtime data is unvalidated |
| `components/ui/icon-symbol.tsx` | 41 | Expo template boilerplate; no component uses it |
| `components/ui/icon-symbol.ios.tsx` | 32 | Same — unused platform variant |
| `assets/gtfs-data/routes.json` | — | Contains `[]`; app fetches GTFS from network |
| `assets/gtfs-data/stops.json` | — | Contains `{}`; leftover stub |
| `assets/gtfs-data/shapes.json` | — | Contains `[]`; leftover stub |
| `assets/gtfs-data/stop-times.json` | — | Contains `[]`; leftover stub |

**Estimated removal: ~365 lines + empty asset stubs**

### 1b. Delete dead functions/exports
| Location | Function | Reason |
|----------|----------|--------|
| `services/gtfs-sync.ts` | `writeJSONToFile` + `GTFS_CACHE_DIR` | Never called; app uses AsyncStorage exclusively |
| `services/api.ts` | `getActiveTrains()` | Never called; app uses `RealtimeService.getAllActiveTrains()` instead |
| `services/api.ts` | `getRouteNameForTrainNumber` (export) | Only used internally in same file; remove `export` keyword |
| `utils/profile-stats.ts` | `getYearsList()` | Zero import sites; `ProfileModal` computes its own year list inline |
| `utils/train-helpers.ts` | `formatTrainNumber`, `matchTrainNumber`, `normalizeTrainNumber` | Only called in tests, never in production code |
| `utils/gtfs-parser.ts` | `getShapesByRoute()` | Never called; always returns everything under key `'all'` anyway |
| `utils/route-colors.ts` | Entire file (31 lines) | Both functions return constant values regardless of input — complete no-ops |
| `utils/units.ts` | `MILES_PER_BURGER` constant | Declared but never referenced; inline literal `26_490` used instead |
| `utils/date-helpers.ts` | `getEndOfDay()` | Only used in tests, not in production code |
| `utils/profile-stats.ts` | `formatDistance()` | Shadows the real one in `utils/units.ts`; never imported |
| `context/ModalContext.tsx` | `getInitialSnap` `type` param | Parameter is accepted but silently ignored |

### 1c. Remove commented-out code
| Location | What |
|----------|------|
| `components/ui/ProfileModal.tsx:429-436` | Commented-out "Rail Friends" button |

---

## 2. Unused Dependencies

Remove from `package.json`:

| Package | Reason |
|---------|--------|
| `lucide-react-native` | Zero imports in any source file |
| `expo-symbols` | Zero imports in any source file |
| `@expo/vector-icons` | App uses `react-native-vector-icons` exclusively |
| `zod` | Only used in `types/gtfs-schemas.ts` which is itself dead code |
| `expo-image` | Zero imports in any source file |
| `expo-network` | Zero imports in any source file |

Audit whether these are actually used or only transitive:
- `@react-navigation/bottom-tabs`, `@react-navigation/elements`, `@react-navigation/native` — app uses `expo-router` only
- `@react-native-community/datetimepicker` — may be transitive via `react-native-calendars`
- `react-native-web`, `react-dom` — web target exists in scripts but likely unused for production

---

## 3. Bug Fixes

### 3a. Duplicate keys in `AMTRAK_ROUTE_NAMES` (services/api.ts)
Train numbers `'364'` and `'365'` are mapped to `'Wolverine'` first, then silently overwritten with `'Blue Water'`. Similarly `'311'`, `'313'`, `'314'` are first `'Lincoln Service'` then overwritten by `'Missouri River Runner'`. JavaScript objects take the last value for duplicate keys.

**Fix:** Convert to a range-based lookup or an array of `[number | range, name]` tuples. This also reduces the 300-line lookup table to ~30 lines.

### 3b. `endAll()` key-splitting bug (services/live-activity.ts:135)
Keys are built as `` `${tripId}-${fromCode}-${toCode}` `` but `tripId` contains hyphens (e.g. `"2026-01-16_AMTK_543"`). `key.split('-')` produces wrong values. Activities will never actually end.

**Fix:** Use a different delimiter (e.g. `|`) or store keys as structured objects.

### 3c. `GTFSRefreshContext.runRefresh` forces unnecessary re-download
When `result.usedCache && !force`, the code immediately calls `runRefresh(true)` — meaning the app **always** re-downloads GTFS from network even when cache is fresh. This wastes bandwidth on every app launch.

**Fix:** Only force-refresh when cache is stale, not when it's fresh.

### 3d. Duplicate `FrequentlyUsedItem` type definition
Defined in both `types/train.ts` and `hooks/useFrequentlyUsed.ts` with different shapes.

**Fix:** Unify in `types/train.ts` and import from there.

---

## 4. Code Duplication

### 4a. Weather API calls duplicated 5 times
`fetchCurrentWeather` in `utils/weather.ts` exists but is bypassed. The Open-Meteo URL is built inline in:
- `train-detail-modal.tsx` (3 times)
- `departure-board-modal.tsx` (2 times)

**Fix:** Centralize all weather fetching in `utils/weather.ts` with appropriate function signatures (current weather, hourly forecast, multi-stop forecast).

### 4b. GTFS-loaded polling loop duplicated 3 times
`MapScreen.tsx`, `useShapes.ts`, and `useStations.ts` each run their own `setInterval` polling `gtfsParser.isLoaded` every 500ms.

**Fix:** Create a `useGTFSLoaded()` hook or add an `isLoaded` value to `GTFSRefreshContext` so consumers react to state changes instead of polling.

### 4c. Duplicate `FONTS` constant
`screens/styles.ts` exports `FONTS = { family: 'System' }`. `train-detail-modal.tsx` re-declares it locally.

**Fix:** Import from `screens/styles.ts` or move to `constants/theme.ts`.

### 4d. Fallback map coordinates repeated 3 times in MapScreen
San Francisco coordinates (`37.78825, -122.4324`) and initial deltas copy-pasted in three `setRegion()` calls.

**Fix:** Extract to a named constant `DEFAULT_MAP_REGION`.

### 4e. Time-parsing logic reimplemented in background-tasks.ts
`services/background-tasks.ts:50-57` manually parses 12-hour time when `utils/time-formatting.ts` already exports `parseTimeToDate`.

**Fix:** Use the existing utility.

### 4f. Duplicate realtime lookup pattern
`RealtimeService.getPositionForTrip` and `getUpdatesForTrip` have identical 6-line fallback logic (try key, extract train number, try again).

**Fix:** Extract to a shared `lookupWithFallback(map, key)` helper.

### 4g. `AnimatedStationMarker` and `LiveTrainMarker` share identical animation logic
Same fade-in on mount, fade-out/in on changes, same spring/timing params, same `Animated.Value` usage. Only the icon differs.

**Fix:** Create a shared `AnimatedMapMarker` component that accepts an icon render prop.

### 4h. Dual `activityKey`/`trainKey` functions
`live-activity.ts` and `train-activity-manager.ts` define the same key-builder function.

**Fix:** (Moot if `train-activity-manager.ts` is deleted per 1a, but if kept, unify.)

---

## 5. Architectural Improvements

### 5a. Dual saved-train loading creates race conditions
Both `MapScreen.tsx` (lines 471-481) and `ModalContent.tsx` (lines 57-117) independently load saved trains and call `setSavedTrains`. They fire on overlapping lifecycle events and can overwrite each other.

**Fix:** Consolidate saved-train loading into a single location — either `TrainContext` or a `useSavedTrains()` hook.

### 5b. `RealtimeService` fetches the same URL twice
`getAllPositions()` and `getAllUpdates()` each call `fetchProtobuf(TRANSITDOCS_GTFS_RT_URL)` with independent caches. The Transitdocs feed is a single response containing both.

**Fix:** Fetch once per TTL window and parse both positions and trip updates from the single response.

### 5c. `TrainAPIService` is a static class with no instance state
All methods are static. This is unnecessary OOP overhead.

**Fix:** Convert to plain exported functions. Same applies to other `*Service` classes if they hold no instance state.

### 5d. `storage.getSavedTrains()` couples persistence with live data
It internally calls `TrainAPIService.getTrainDetails()` → `enrichWithRealtimeData()`, meaning a storage read triggers network requests. Callers then immediately call `refreshRealtimeData()` again.

**Fix:** `getSavedTrains()` should return statically-reconstructed trains (no realtime). Callers handle realtime enrichment explicitly.

### 5e. `GTFSRefreshContext.initializeGTFS` requires consumer to call it
It's a one-shot function guarded by `hasInitialized.current`, called from `ModalContent.tsx`'s `useEffect`. The provider could run initialization in its own `useEffect`.

**Fix:** Move initialization into the provider's own effect.

### 5f. `ModalContext` exposes too much (~20 values)
5 ref handles, 5 boolean visibility flags, 8 navigation functions all leak through context.

**Fix:** Consider driving modal animations from state (which modal is active + snap point) rather than imperative refs. Each modal observes the active-modal state and animates itself.

---

## 6. Large File Decomposition

### 6a. `MapScreen.tsx` (885 lines) — God component
Extract:
- `useMapViewport()` hook — debounced/throttled region tracking (3 timer refs)
- `useLocationPermission()` hook — permission request + fallback region
- `DEFAULT_MAP_REGION` constant
- Map overlay rendering into a `<MapOverlays>` sub-component

### 6b. `TwoStationSearch.tsx` (1,395 lines)
Extract:
- `StationAutocomplete` sub-component (station input + dropdown)
- `SearchResults` sub-component (results list + sorting)
- `useTwoStationSearch()` hook (search state + API calls)

### 6c. `train-detail-modal.tsx` (1,394 lines)
Extract:
- `useTrainWeather()` hook (destination + per-stop weather fetching)
- `StopTimeline` sub-component (per-stop rendering)
- `TrainHeader` sub-component (countdown, save/unsave, share)

### 6d. `SettingsModal.tsx` (1,141 lines)
Extract:
- `CalendarSyncSettings` sub-component
- `NotificationSettings` sub-component
- `DebugLogViewer` sub-component
- `DataProviders` sub-component

### 6e. `departure-board-modal.tsx` (1,072 lines)
Extract:
- `DepartureBoardFilters` sub-component
- `DepartureBoardList` sub-component
- `useDepartureBoard()` hook (data fetching + filtering)

### 6f. `ProfileModal.tsx` (1,049 lines)
Extract:
- `TripHistory` sub-component
- `LifetimeStats` sub-component
- `TicketArtShare` sub-component

### 6g. `AMTRAK_ROUTE_NAMES` in api.ts (~300 lines)
Move to `constants/amtrak-routes.ts` as a range-based lookup (collapses to ~30 lines).

---

## 7. Performance Improvements

### 7a. Triple GTFS polling loops
Three independent `setInterval` loops (MapScreen, useShapes, useStations) polling `gtfsParser.isLoaded` every 500ms.

**Fix:** Event-driven via context or callback. See 4b.

### 7b. `sortedTrains` recomputed every render in ModalContent
`[...savedTrains].sort(...)` runs on every render without memoization.

**Fix:** Wrap in `useMemo` with `[savedTrains]` dependency.

### 7c. `useBatchedItems` and `useShapes` implement the same batching algorithm independently
`useShapes` was presumably written first and never refactored.

**Fix:** Rewrite `useShapes` to use `useBatchedItems` internally.

### 7d. O(n*m) scan in `clusteredLiveTrains`
`savedTrains.find()` inside `.map()` on all live trains.

**Fix:** Pre-compute a `Set` of saved train numbers for O(1) lookup.

### 7e. Inline `onPress` lambdas recreated every render for map markers
`Marker` components may re-mount when props change.

**Fix:** Memoize press handlers or move them into the marker component.

### 7f. `useLiveTrains` returns 5 values; only 1 is used
`loading`, `error`, `lastUpdated`, `refresh` are never consumed by `MapScreen`.

**Fix:** Either use them (show stale-data indicator, error feedback) or simplify the hook's return value.

---

## 8. Hardcoded Values to Extract

| Value | Location(s) | Suggested Constant |
|-------|-------------|-------------------|
| `37.78825, -122.4324` + deltas | MapScreen (3x) | `DEFAULT_MAP_REGION` |
| `500` ms animation | MapScreen (6x) | `MAP_ANIMATION_DURATION` |
| `15000` / `20000` ms polling | Multiple hooks | `REALTIME_POLL_INTERVAL` |
| `2 * 60 * 60 * 1000` | live-activity + notifications | `PRE_DEPARTURE_WINDOW_MS` |
| `90` days | calendar-sync | `CALENDAR_SCAN_DAYS` |
| `24901` (Earth circumference) | ProfileModal | `EARTH_CIRCUMFERENCE_MILES` |
| `'#3949AB'`, `'#B71C1C'` etc. | ProfileModal | Move to `constants/theme.ts` |
| `ERROR_ALERT_COOLDOWN`, `MAX_SILENT_ERRORS`, `CACHE_TTL` | realtime.ts | Group in a config file or `constants/` |

---

## 9. Type Safety

| Issue | Location | Fix |
|-------|----------|-----|
| `Record<string, any[]>` | gtfs-parser.ts `getRawShapesData` | Change to `Record<string, Shape[]>` |
| `as any` for icon names | train-detail-modal, departure-board-modal | Type `getWeatherCondition()` return to include proper icon name type |
| Loose `trainData` union | train-detail-modal | Resolve `Train \| undefined \| null` to `Train \| null` early with a guard |
| Mixed React import style | Codebase-wide | Standardize on named destructuring (`import { useEffect, useState }`) |

---

## 10. Minor Cleanup

| Item | Action |
|------|--------|
| `useFrequentlyUsed` hook | Rename to `useDefaultSuggestions` or implement actual frequency tracking |
| `services/live-activity.ts` | Document that it's a forward-compatible stub (no-ops until `expo-live-activity` is available) |
| `background-tasks.ts` side-effect import in `_layout.tsx` | Add a comment explaining the import is for `TaskManager.defineTask` side effect |
| `screens/styles.ts` location | Move to `constants/styles.ts` since it's shared across components |
| Inconsistent icon libraries | Standardize on `react-native-vector-icons` and remove unused icon packages |
| `handleLiveTrainMarkerPress` silent failure | Add user-facing error feedback when `getTrainDetails()` fails |

---

## Priority Order

1. **Bug fixes** (Section 3) — correctness issues, fix first
2. **Dead code removal** (Sections 1-2) — immediate bloat reduction (~500+ lines + dependencies)
3. **Duplicate code consolidation** (Section 4) — reduce maintenance surface
4. **Performance fixes** (Section 7) — triple polling, missing memoization
5. **Architectural improvements** (Section 5) — race conditions, coupling
6. **Hardcoded values** (Section 8) — maintainability
7. **Large file decomposition** (Section 6) — readability and maintainability
8. **Type safety** (Section 9) — correctness guardrails
9. **Minor cleanup** (Section 10) — polish
