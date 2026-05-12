# Tracky

Tracky is a real-time Amtrak train tracker for iOS and Android, built with React Native and Expo. It brings together live GTFS-RT vehicle positions, Amtrak's static schedule data, and destination weather forecasts into a single map-first interface. Every active Amtrak train in the country — Acela, Southwest Chief, Coast Starlight, and the rest — appears as a marker on a full-screen map that updates every 15 seconds. You can save trains you care about, browse station departure boards, search by train number or route name, plan trips between any two stations, and track delays stop-by-stop in real time.

The app is designed around a single map screen with a stack of gesture-driven bottom-sheet modals for navigation. Swiping, tapping, and panning replace traditional screen transitions — trains slide up into detail views, stations open departure boards, and settings pages animate in from the right. All animations run at 60 fps on the native thread via Reanimated. Under the hood, the app aggressively optimizes for mobile: viewport culling ensures only visible routes, stations, and trains are rendered; station markers cluster and uncluster dynamically as you zoom; route polylines load progressively; and a tiered caching strategy minimizes network requests and battery drain.

## Features

### Live Map

- Full-screen interactive map with real-time train markers, station pins, and route polylines
- Train positions update every 15 seconds from the Transitdocs GTFS-RT feed
- Color-coded route lines for each Amtrak service
- Smart station clustering that adapts to zoom level
- Standard and satellite map views with GPS-based user location
- Floating settings pill to toggle route lines, station markers, train visibility, and map type

### Train Tracking

- Save trains for persistent tracking across sessions
- Support for partial trip segments (e.g., just Boston to New York on a longer route)
- Real-time delay status at every stop along the route
- Train speed, bearing, and last-updated timestamp
- Countdown timers showing time until departure for today's trains
- Automatic archival of completed trips to travel history
- iOS Live Activity with lock screen and Dynamic Island support for active trains

### Train Details

- Full itinerary with departure and arrival times for every stop
- Multi-day journey support with day-offset indicators
- Live delay information per stop (early, on time, or delayed by N minutes)
- Weather forecast at the destination (temperature, conditions, hourly breakdown)
- Tap any station in the itinerary to jump to its departure board

### Station Departure Boards

- View all arriving and departing trains for any Amtrak station
- Filter by arrivals, departures, or both
- Date picker for browsing future schedules
- Search within results
- Swipe any train to save it directly from the board

### Search

- Unified search by train number, route name, or station name/code
- Two-station trip search: pick origin, destination, and date to find matching trains
- Real-time autocomplete as you type

### Profile and History

- Travel history with completed trip cards showing route, duration, and distance
- Lifetime statistics: total trips, total distance, total time on trains
- Share trips as formatted "ticket art" images
- Swipe-to-delete history entries with haptic feedback

### Settings

- Temperature units (Fahrenheit / Celsius)
- Distance units (miles / kilometers / hotdogs)
- Calendar sync: scan device calendars for Amtrak trips and auto-import them
- Data providers page listing all external data sources
- Debug log viewer with filtering by severity level
- About page with contributors and version info

## Monorepo Structure

```
Tracky/
├── apps/
│   ├── mobile/    Expo app (iOS + Android)
│   ├── web/       Next.js landing page
│   └── api/       Go API server
├── packages/      Shared code (reserved, not yet populated)
├── package.json   Root workspace scripts
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io) — `npm install -g pnpm`
- [Go](https://go.dev) 1.26+ — `brew install go`
- iOS Simulator (Mac) or Android Emulator

### Install all dependencies

From the repo root:

```bash
pnpm install
```

### Environment Setup

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/mobile/.env` and set your Google Maps API key:

```
GOOGLE_MAPS_API_KEY=your_key_here
```

You can get a Google Maps API key from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Make sure to enable **Maps SDK for Android**.

> **Note:** `.env` files are gitignored. Never commit your API keys.

### Root-level scripts

The root `package.json` provides convenience scripts that use pnpm workspace filtering:

```bash
pnpm dev:web           # Start Next.js dev server (apps/web)
pnpm dev:mobile        # Start Expo dev server (apps/mobile)
pnpm build:web         # Build the landing page
pnpm test:mobile       # Run mobile tests
pnpm lint              # Lint all packages
pnpm type-check        # Type-check all packages
```

### Run the mobile app

```bash
cd apps/mobile
pnpm start
```

Then press `i` for iOS Simulator, `a` for Android Emulator, or scan the QR code with Expo Go on a physical device.

### Run the landing page

```bash
cd apps/web
pnpm dev
```

### Run the backend

```bash
cd apps/api
go run ./cmd/api
```

The API server starts on port 8080 by default (configurable via `PORT` env var).

### EAS builds

Always run EAS commands from `apps/mobile/`:

```bash
cd apps/mobile
pnpm exec eas build --platform ios
```

## Development

### Scripts

All mobile scripts run from `apps/mobile/`:

```bash
pnpm start             # Start Expo dev server
pnpm ios               # Launch on iOS Simulator
pnpm android           # Launch on Android Emulator

pnpm type-check        # TypeScript type checking
pnpm lint              # ESLint
pnpm format            # Prettier formatting
pnpm format:check      # Check formatting without writing

pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report

pnpm validate          # Run all checks (type-check + format + lint + test)
```

Web scripts run from `apps/web/`:

```bash
pnpm dev               # Start Next.js dev server
pnpm build             # Production build
pnpm start             # Start production server
pnpm lint              # ESLint
```

Backend scripts run from `apps/api/`:

```bash
go run ./cmd/api       # Start the API server
go test ./...          # Run all tests
go build -o bin/api ./cmd/api  # Build binary
```

### Code Quality

- **TypeScript** in strict mode
- **ESLint** with Expo preset
- **Prettier** (120-char lines, single quotes)
- **Jest** with React Native Testing Library (40% coverage threshold)
- Run `pnpm validate` before committing to catch all issues

### Pre-commit

Run `pnpm validate` (from `apps/mobile/`) before committing to ensure TypeScript compiles, formatting is correct, lint rules pass, and all tests pass.

## Architecture

### Project Structure

```
apps/mobile/
├── screens/                # MapScreen (primary screen)
├── components/
│   ├── map/                # Map markers, routes, overlays
│   └── ui/                 # Modals, lists, search, controls
├── context/                # React Context providers
├── hooks/                  # Custom hooks (live trains, search, etc.)
├── services/               # Data fetching, caching, persistence
├── utils/                  # Parsers, formatters, clustering
├── types/                  # TypeScript definitions
├── widgets/                # iOS Live Activity and widget implementations
├── assets/                 # Static assets and cached GTFS data
└── constants/              # Theme and configuration

apps/api/
└── cmd/api/                # Entry point (main.go)

apps/web/
├── app/
│   ├── components/         # Hero, Header, Footer, LiveMap, DepartureBoard, etc.
│   ├── hooks/              # useReveal, useTypewriter
│   ├── page.tsx            # Landing page
│   └── layout.tsx          # Root layout
└── public/                 # Static assets (logo, icons)
```

### State Management

| Context              | Responsibility                                          |
| -------------------- | ------------------------------------------------------- |
| `TrainContext`        | Saved trains list, selected train, add/remove/refresh   |
| `ModalContext`        | Modal navigation stack, snap points, back navigation    |
| `UnitsContext`        | Temperature and distance unit preferences               |
| `ThemeContext`        | Dark/light theme management                             |
| `GTFSRefreshContext`  | GTFS cache status and manual refresh trigger            |

### Data Flow

```
Transitdocs GTFS-RT API ──► Protobuf decode ──► 15s in-memory cache ──► Train positions
                                                                            │
Amtrak GTFS.zip ──► Parse on startup ──► Compressed JSON (7-day cache) ──► Schedule data
                                                                            │
                                                              Merge ◄───────┘
                                                                │
                                                          Map markers
                                                          Train details
                                                          Departure boards
```

### Services

| Service                    | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `realtime.ts`              | Fetches and parses GTFS-RT protobuf; caches positions and delays |
| `api.ts`                   | High-level API combining schedule + real-time data               |
| `gtfs-sync.ts`             | Downloads and parses Amtrak GTFS.zip weekly                      |
| `storage.ts`               | AsyncStorage persistence for saved trains and history            |
| `shape-loader.ts`          | Lazy-loads route polylines based on map viewport                 |
| `station-loader.ts`        | Lazy-loads station markers based on map viewport                 |
| `calendar-sync.ts`         | Scans device calendars for Amtrak trips and imports them         |
| `live-activity.ts`         | Manages iOS Live Activities for tracked trains                   |
| `train-activity-manager.ts`| Coordinates train activity and widget lifecycle                  |
| `widget-data.ts`           | Prepares data for iOS widgets                                    |
| `background-tasks.ts`      | Background fetch task management                                 |
| `notifications.ts`         | Push and local notification handling                             |
| `location-suggestions.ts`  | Location-based station suggestions                               |

### Real-Time Data

The app consumes the Transitdocs GTFS-RT feed at `https://asm-backend.transitdocs.com/gtfs/amtrak`, which provides Protocol Buffer-encoded vehicle positions and trip updates for all active Amtrak trains.

**Trip ID format:** `YYYY-MM-DD_AMTK_NNN` (e.g., `2026-01-16_AMTK_543`)

The app supports flexible ID matching — you can query by full trip ID or just the train number. Positions and trip updates are cached for 15 seconds to balance freshness with performance and battery life.

**Cache behavior:**
- **Hit:** Return cached data immediately if less than 15 seconds old
- **Miss:** Fetch fresh protobuf, parse, and update the cache
- **Error:** Return stale cache if available; empty map otherwise

### GTFS Static Data

On startup, the app checks for locally cached GTFS data. If the cache is missing or older than 7 days, it fetches `GTFS.zip` from Amtrak and parses `routes.txt`, `stops.txt`, `stop_times.txt`, and `shapes.txt` into compressed JSON for offline access.

### Performance

- **Viewport culling** — only visible routes, stations, and trains are rendered
- **Throttled region changes** — 100ms throttle on map pan/zoom events
- **Debounced clustering** — 300ms debounce for marker reclustering
- **Batched rendering** — station and train markers drip-fed to the map
- **Real-time cache** — 15s TTL prevents redundant API calls
- **Reanimated animations** — all transitions run at 60 fps on the native thread

## API Surface (High Level)

Tracky mobile is wired to the backend via:

- REST base URL: `https://api.trackyapp.net` (default from `apps/mobile/constants/config.ts`)
- WebSocket URL: `wss://api.trackyapp.net/ws/realtime` (default from `apps/mobile/constants/config.ts`)

The endpoint contracts are wrapped in `apps/mobile/services/api-client.ts`, with higher-level train/domain adapters in `apps/mobile/services/api.ts`.

> Note: `apps/api/cmd/api/main.go` in this workspace currently exposes a minimal local server (`/health`). The `/v1/*` surface below reflects the API expected by the mobile app client.

### Endpoint Map (REST)

| Endpoint | Purpose | Maps to app behavior |
| --- | --- | --- |
| `GET /health` | Liveness check for local API process | Local backend smoke check |
| `GET /v1/search?q=&provider=&types=` | Unified search across stations, trains, routes | Search modal suggestions and station-only search flow |
| `GET /v1/providers/{provider}` | Provider metadata (timezone, name, etc.) | Agency/timezone lookups used by cached stop/agency helpers |
| `GET /v1/stops/{provider}/{stopCode}` | Stop metadata by code | Trip detail stop enrichment and station metadata hydration |
| `GET /v1/stops/nearby?lat=&lon=&radius_m=&provider=` | Nearby stations around location | Search screen nearby suggestions (best-effort) |
| `GET /v1/routes?provider=` | List routes for provider | Popular route suggestions in search |
| `GET /v1/routes/{provider}/{routeCode}` | Single route metadata | Route selection hydration and route-name cache prefetch |
| `GET /v1/routes/{provider}/{routeCode}/trains` | Trains that run on a route | Route expansion into train list in search |
| `GET /v1/trains/{trainNumber}/service?provider=&from=&to=` | Service date range for a train number | Bounds the train-number date picker |
| `GET /v1/trips/lookup?provider=&train_number=&date=` | Resolve train number + date into trip IDs | Train-number search flow and train detail resolution |
| `GET /v1/trips/{tripId}` | Trip metadata (route/headsign/service) | `TrainAPIService.getTrainDetails` trip resolution |
| `GET /v1/trips/{tripId}/stops` | Scheduled stop timeline for trip | Train detail timeline, trip selection, saved-trip reconstruction |
| `GET /v1/departures?stop_id=&date=` | Departures/arrivals for a station on a date | Station departure board and nearby suggestion train rows |
| `GET /v1/connections?from_stop=&to_stop=&date=` | Station-to-station trip options | Two-station search results |
| `GET /v1/runs/{provider}/{tripId}/{runDate}/stops` | Per-stop scheduled/estimated/actual realtime rows | Live delay overlays in trip search and trip detail |
| `GET /v1/active?provider=` | Currently active runs snapshot | "Live only" filtering for route train lists |

### Realtime Stream (WebSocket)

| Endpoint | Purpose | Maps to app behavior |
| --- | --- | --- |
| `WS /ws/realtime` | Pushes `realtime_update` snapshots by provider after subscribe/unsubscribe messages | Live train markers on map, saved-train realtime refresh, and route-name prefetch warming |

### Where This Is Consumed in the App

- Search and trip planning: `apps/mobile/components/TwoStationSearch.tsx`
- Departure boards: `apps/mobile/components/ui/DepartureBoardModal.tsx`
- Train detail per-stop enrichment: `apps/mobile/hooks/useTripDetail.ts`
- Saved train reconstruction and refresh: `apps/mobile/services/storage.ts`, `apps/mobile/services/api.ts`
- Live map and realtime fanout: `apps/mobile/context/RealtimeContext.tsx`, `apps/mobile/services/ws-client.ts`, `apps/mobile/hooks/useLiveTrains.ts`

## Tech Stack

- **React Native** 0.83 / **React** 19 / **Expo** 55 with Expo Router
- **TypeScript** 5.9 in strict mode
- **react-native-maps** for map rendering
- **react-native-reanimated** 4.2 for animations
- **react-native-gesture-handler** for swipe and pan gestures
- **gtfs-realtime-bindings** for protobuf parsing
- **AsyncStorage** for local persistence
- **expo-widgets** for iOS Live Activity and Dynamic Island
- **Next.js** 16 / **Tailwind CSS** 4 for the landing page
- **Go** 1.26 for the API server
- **Jest** 29 / **ESLint** 9 / **Prettier** 3.8

## Contributing

1. Create a feature branch from `main`
2. Write tests for new features or bug fixes
3. Run `pnpm validate` (from `apps/mobile/`) to pass all checks
4. Open a pull request

## License

CC‑BY‑NC (Creative Use, Attribution Required, Non-Commerical) 
