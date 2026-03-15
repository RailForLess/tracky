# Delay Calculation System

This document describes how train delays are calculated and displayed in the Tracky app.

## Overview

Delays are sourced from GTFS-RT (General Transit Feed Specification - Realtime) feeds and converted from seconds to minutes for display.

## Calculation Flow

```
GTFS-RT Feed (seconds)
    ↓
parseTripUpdates() extracts departure_delay in seconds
    ↓
getDelayForStop() converts: Math.round(seconds / 60) = minutes
    ↓
enrichWithRealtimeData() stores delay in Train.realtime.delay
    ↓
formatDelay() creates display string
    ↓
UI Components display with conditional styling
```

## Key Files and Functions

### 1. Data Source - `services/realtime.ts`

**RealtimeUpdate Interface (lines 19-25)**

```typescript
export interface RealtimeUpdate {
  trip_id: string;
  stop_id?: string;
  arrival_delay?: number; // seconds
  departure_delay?: number; // seconds
  schedule_relationship?: 'SCHEDULED' | 'SKIPPED' | 'NO_DATA';
}
```

**parseTripUpdates() (lines 112-148)**

- Decodes GTFS-RT protobuf data
- Extracts `stopTimeUpdate.arrival?.delay` and `stopTimeUpdate.departure?.delay`
- Stores delays in seconds as received from the feed

### 2. Conversion - `services/realtime.ts`

**getDelayForStop() (lines 251-265)**

```typescript
static async getDelayForStop(tripIdOrTrainNumber: string, stopId: string): Promise<number | null> {
  const updates = await this.getUpdatesForTrip(tripIdOrTrainNumber);
  const stopUpdate = updates.find(u => u.stop_id === stopId);

  if (stopUpdate && stopUpdate.departure_delay !== undefined) {
    return Math.round(stopUpdate.departure_delay / 60); // Convert seconds to minutes
  }

  return null;
}
```

### 3. Formatting - `services/realtime.ts`

**formatDelay() (lines 270-278)**

```typescript
static formatDelay(delayMinutes: number | null): string {
  if (delayMinutes === null || delayMinutes === 0) {
    return 'On Time';
  }
  if (delayMinutes > 0) {
    return `Delayed ${delayMinutes}m`;
  }
  return `Early ${Math.abs(delayMinutes)}m`;
}
```

| Delay Value           | Display      |
| --------------------- | ------------ |
| `null` or `0`         | "On Time"    |
| Positive (e.g., `5`)  | "Delayed 5m" |
| Negative (e.g., `-3`) | "Early 3m"   |

### 4. Integration - `services/api.ts`

**enrichWithRealtimeData() (lines 299-316)**

```typescript
private static async enrichWithRealtimeData(train: Train): Promise<void> {
  const delay = await RealtimeService.getDelayForStop(
    train.tripId || train.trainNumber,
    train.fromCode
  );

  train.realtime = {
    delay: delay ?? undefined,
    status: RealtimeService.formatDelay(delay),
    // ... other realtime data
  };
}
```

### 5. Data Structure - `types/train.ts`

**Train.realtime (lines 23-28)**

```typescript
realtime?: {
  position?: { lat: number; lon: number };
  delay?: number;      // minutes
  status?: string;     // formatted display string
  lastUpdated?: number;
};
```

### 6. UI Display - `components/ui/departure-board-modal.tsx`

**Delay Display (lines 325-359)**

- Shows `+{delay}m` when delay > 0
- Applies `statusDelayed` style (red) when delayed
- Applies `statusOnTime` style (green) when on-time or early

## Summary

The core delay calculation is:

```typescript
delayInMinutes = Math.round(departure_delay_in_seconds / 60);
```

The system handles three states:

1. **On Time** - delay is null or 0
2. **Delayed** - delay is positive (train is late)
3. **Early** - delay is negative (train is ahead of schedule)
