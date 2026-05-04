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
│   ├── api/       Go API server + edge collector
│   └── collector/ Cloudflare Worker hosting the collector container
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

The backend is split into two Go binaries plus a thin Cloudflare Worker that hosts the collector container.

**On-prem server** ([apps/api/cmd/server](apps/api/cmd/server)) — accepts collector ingest, drains R2 backlog on outage recovery, serves WebSocket clients:

```bash
cd apps/api
INGEST_SECRET=dev go run ./cmd/server
```

Listens on `:8080` (override with `PORT`). Set the four `R2_*` vars in `cmd/server/.env.example` to enable the drainer.

**Edge collector** ([apps/api/cmd/collector](apps/api/cmd/collector)) — polls every provider and ships per-tick snapshots:

```bash
cd apps/api
# Mock mode (default): logs snapshots to stderr, no network destination.
go run ./cmd/collector

# Talk to a local server:
INGEST_URL=http://localhost:8080 INGEST_SECRET=dev go run ./cmd/collector
```

**Collector Worker** ([apps/collector](apps/collector)) — only needed when validating the container/R2 path:

```bash
cd apps/collector
npx wrangler dev
```

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
go run ./cmd/server                   # Start the on-prem ingest + WS server
go run ./cmd/collector                # Start the edge collector (mock emitter by default)
go run ./cmd/sync-static              # One-shot static GTFS sync to the DB

go test ./...                         # Run all Go tests
go test ./drainer/... -v              # Pure-logic drainer replay tests
go test ./collector/... -v            # Emitter chain + poller tests
go test ./routes/... -v               # /ingest handler tests

go build -o bin/server ./cmd/server   # Build the server binary
go build -o bin/collector ./cmd/collector
```

Collector Worker scripts run from `apps/collector/`:

```bash
npx wrangler dev                      # Local Worker dev server (incl. R2 emulation)
npx wrangler types                    # Regenerate Env types after wrangler.jsonc edits
npx vitest run                        # Worker tests (runs on the real workerd runtime)
```

#### Local end-to-end smoke

In two terminals (no Cloudflare deps required):

```bash
# 1. Server
cd apps/api && INGEST_SECRET=dev go run ./cmd/server

# 2. Collector → server (per-tick snapshots over HTTP)
cd apps/api && INGEST_URL=http://localhost:8080 INGEST_SECRET=dev go run ./cmd/collector
```

Then connect a WebSocket client to `ws://localhost:8080/ws/realtime` and send `{"action":"subscribe","providers":["amtrak"]}` — you should see `realtime_update` messages within ~30 s.

To exercise the R2 backlog path, kill the server while the collector is running with `BACKLOG_URL` set, then restart the server with the four `R2_*` env vars to watch the drainer replay backlogged snapshots.

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
├── cmd/server/             # On-prem ingest + WebSocket server
├── cmd/collector/          # Edge collector (runs in Cloudflare container)
├── cmd/sync-static/        # CLI for static GTFS sync + tile generation
├── collector/              # Snapshot, Emitter chain (HTTP + Storage + Fallback)
├── drainer/                # R2 backlog replay (pure Replay logic + S3 glue)
├── realtime/               # Processor (single ingest sink → ws.Hub, TODO timescale)
├── routes/                 # HTTP handlers incl. POST /ingest
├── providers/              # Per-operator GTFS-RT parsers
├── gtfs/                   # Shared GTFS static + realtime parsing
├── ws/                     # Hub + WebSocket client handlers
└── spec/                   # TrainPosition, TrainStopTime, etc.

apps/collector/
├── src/
│   ├── index.ts            # Worker entry (just /health)
│   └── collector-container.ts  # CollectorContainer DO + outbound() R2 proxy
├── container/Dockerfile    # Multi-stage Go build for the collector
└── wrangler.jsonc          # Container + R2 + DO bindings

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

## API Usage

### Get All Active Trains

```typescript
import { RealtimeService } from './services/realtime';

const trains = await RealtimeService.getAllActiveTrains();
// Returns ~150-160 active trains with position, speed, bearing
```

### Get a Specific Train's Position

```typescript
const position = await RealtimeService.getPositionForTrip('543');
// Accepts train number ("543") or full trip ID ("2026-01-16_AMTK_543")
```

### Check Delay at a Stop

```typescript
const delay = await RealtimeService.getDelayForStop('543', 'NYP');
console.log(RealtimeService.formatDelay(delay));
// "On Time", "Delayed 5m", or "Early 2m"
```

### Get Full Train Details (Schedule + Real-Time)

```typescript
import { TrainAPIService } from './services/api';

const train = await TrainAPIService.getTrainDetails('543');
// Includes full itinerary, real-time position, and delay status
```

### Search Stations

```typescript
import { gtfsParser } from './utils/gtfs-parser';

const stations = await gtfsParser.searchStations('Boston');
```

### Find Trips Between Two Stations

```typescript
const trips = await gtfsParser.findTripsWithStops('BOS', 'NYP');
```

### Refresh Real-Time Data for a Saved Train

```typescript
const updated = await TrainAPIService.refreshRealtimeData(existingSavedTrain);
// updated.realtime now has the latest position and delay
```

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
