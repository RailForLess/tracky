# Delay Calculation Report

How train delays are sourced, computed, displayed, stored, and aggregated in the Tracky app.

---

## 1. Data Source

All real-time delay data comes from a **GTFS-RT (General Transit Feed Specification - Realtime)** feed served by Transitdocs:

- **Endpoint:** `https://asm-backend.transitdocs.com/gtfs/amtrak`
- **Format:** Protocol Buffers (protobuf), parsed via the `gtfs-realtime-bindings` library
- **Contains:** Vehicle positions and **trip updates** with per-stop delay values

The feed is fetched and cached in `services/realtime.ts` by the `RealtimeService` class with a **15-second TTL**.

---

## 2. Parsing the Feed

When the protobuf feed is decoded, each GTFS-RT entity is inspected for `tripUpdate` data. For every stop time update within a trip update, the following is extracted (`services/realtime.ts` ~line 160):

```typescript
{
  trip_id: string,
  stop_id: string,
  arrival_delay: number | undefined,   // seconds
  departure_delay: number | undefined, // seconds
  schedule_relationship: 'SCHEDULED' | 'SKIPPED' | 'NO_DATA',
}
```

These are stored in a `Map<string, RealtimeUpdate[]>` keyed by `trip_id`.

---

## 3. Retrieving Delay for a Specific Stop

**Method:** `RealtimeService.getDelayForStop(tripIdOrTrainNumber, stopId)`

1. Looks up all stop updates for the given trip ID (or train number).
2. Finds the update matching the requested `stopId`.
3. Reads the `departure_delay` field (in **seconds**).
4. Converts to **minutes**: `Math.round(departure_delay / 60)`.
5. Returns `null` if no data is available.

**Key detail:** The app uses `departure_delay`, not `arrival_delay`, as the canonical delay value.

---

## 4. Enrichment into Train Objects

**Method:** `TrainAPIService.enrichWithRealtimeData(train)` in `services/api.ts` (~line 462)

For any train where `daysAway <= 0` (departing today or already departed), the service:

1. Fetches the live position via `getPositionForTrip()`.
2. Fetches the delay via `getDelayForStop()` using the train's **origin station code** (`train.fromCode`).
3. Attaches the result to the train object:

```typescript
train.realtime = {
  position: { lat, lon } | undefined,
  delay: number | undefined,          // minutes
  status: string,                      // e.g. "On Time", "Delayed 15m", "Early 3m"
  lastUpdated: number | undefined,     // Unix timestamp
};
```

Trains with `daysAway > 0` (future departures) are skipped to avoid matching the wrong instance of a recurring train number.

---

## 5. Delay Formatting

**Method:** `RealtimeService.formatDelay(delayMinutes)` in `services/realtime.ts`

| Delay value | Output |
|---|---|
| `null` or `0` | `"On Time"` |
| `> 0` (e.g. 15) | `"Delayed 15m"` |
| `< 0` (e.g. -3) | `"Early 3m"` |

---

## 6. Display in the UI

### Departure Board (`components/ui/departure-board-modal.tsx` ~line 302)

When a train has a positive delay:

1. The **adjusted time** is computed using `addDelayToTime()`.
2. The adjusted time is shown in a "delayed" style (typically red/highlighted).
3. A label like `"Delay 15m"` is rendered below the time.

When there is no delay (or delay is 0/null), the scheduled time is shown normally.

### Time Adjustment (`utils/time-formatting.ts`)

**Function:** `addDelayToTime(timeStr, delayMinutes, baseDayOffset)`

- Parses the 12-hour time string (e.g. `"2:30 PM"`)
- Adds `delayMinutes` to it
- Handles day-boundary rollover (e.g. 11:30 PM + 120 min = 1:30 AM next day, `dayOffset + 1`)
- Returns `{ time: string, dayOffset: number }`

---

## 7. Live Polling

### Map Screen (`screens/MapScreen.tsx` ~line 466)

All displayed trains are refreshed with real-time data:

```typescript
const trainsWithRealtime = await Promise.all(
  trains.map(train => TrainAPIService.refreshRealtimeData(train))
);
```

### useLiveTrains Hook (`hooks/useLiveTrains.ts`)

- Polls active train positions and delays every **15 seconds** by default.
- Can be enabled/disabled and manually refreshed.

---

## 8. Storage of Delays in Trip History

When a trip is archived to completed history (`services/storage.ts` ~line 354), the current real-time delay is persisted:

```typescript
const entry: CompletedTrip = {
  // ...
  delay: train.realtime?.delay,  // minutes, positive = late, negative = early
  // ...
};
```

This is a **snapshot** of the delay at the time of archival, not a retrospective calculation.

---

## 9. Profile Statistics

**File:** `utils/profile-stats.ts`

Aggregate delay stats are computed from stored `CompletedTrip` records:

| Stat | Calculation |
|---|---|
| `delayedTripsCount` | Count of trips where `delay > 0` |
| `totalDelayMinutes` | Sum of `delay` across all delayed trips |
| `averageDelayMinutes` | `totalDelayMinutes / delayedTripsCount` (0 if none) |

**Note:** Only positive delays (late trains) are counted. Early arrivals (`delay < 0`) are excluded from these aggregates.

---

## 10. Error Handling

- If the GTFS-RT fetch fails, **cached data** is returned (if within the 15s window).
- If no cached data exists, methods return `null`/empty — the UI gracefully falls back to showing scheduled times only.
- Error alerts are **rate-limited** to once per minute.
- Specific HTTP status codes produce tailored messages (503 = service unavailable, 429 = rate limited).

---

## 11. Summary of the Data Flow

```
Transitdocs GTFS-RT Feed (protobuf, seconds)
        │
        ▼
RealtimeService.fetchAndParseFeed()
        │
        ▼
Cached Map<trip_id, RealtimeUpdate[]>  (15s TTL)
        │
        ▼
getDelayForStop(tripId, stopId)
        │  → finds matching stop's departure_delay
        │  → Math.round(seconds / 60) → minutes
        ▼
TrainAPIService.enrichWithRealtimeData(train)
        │  → train.realtime.delay (minutes)
        │  → train.realtime.status ("Delayed 15m")
        ▼
    ┌───┴───────────────────┐
    │                       │
    ▼                       ▼
UI Display              Storage
(adjusted times,        (snapshot delay
 delay labels)           in CompletedTrip)
                            │
                            ▼
                      Profile Stats
                      (total, avg, count)
```

---

## 12. Key Files

| File | Role |
|---|---|
| `services/realtime.ts` | Fetches GTFS-RT, parses delays, caching, formatting |
| `services/api.ts` | Enriches train objects with real-time delay data |
| `utils/time-formatting.ts` | Adds delay minutes to scheduled times |
| `types/train.ts` | Type definitions (`realtime.delay`, `CompletedTrip.delay`) |
| `components/ui/departure-board-modal.tsx` | Renders delayed times and labels |
| `services/storage.ts` | Persists delay snapshot when archiving trips |
| `utils/profile-stats.ts` | Aggregates delay statistics for profile |
| `hooks/useLiveTrains.ts` | Polls for live updates on a 15-second interval |
