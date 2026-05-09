/**
 * Live trains feed for the map. Consumes the realtime WebSocket via
 * RealtimeContext and adapts ApiTrainPosition into the LiveTrain shape
 * that LiveTrainMarker expects.
 */

import { useMemo } from 'react';
import { useRealtimePositions } from '../context/RealtimeContext';
import { getTrainDisplayName } from '../services/api';

export interface LiveTrain {
  trainNumber: string;
  tripId: string;
  position: {
    lat: number;
    lon: number;
    bearing?: number;
    speed?: number;
  };
  routeName: string | null;
  timestamp: number;
}

/**
 * @param _intervalMs - kept for backwards compat; no-op now (WS-driven).
 * @param enabled    - when false, hide trains without unsubscribing.
 */
export function useLiveTrains(_intervalMs: number = 15000, enabled: boolean = true) {
  const positions = useRealtimePositions();

  const liveTrains = useMemo<LiveTrain[]>(() => {
    if (!enabled) return [];
    const out: LiveTrain[] = [];
    for (const p of positions) {
      if (p.lat == null || p.lon == null) continue;
      const { routeName } = getTrainDisplayName(p.tripId, p.trainNumber, p.routeId);
      const ts = Date.parse(p.lastUpdated);
      out.push({
        trainNumber: p.trainNumber,
        tripId: p.tripId,
        position: {
          lat: p.lat,
          lon: p.lon,
          bearing: p.heading ?? undefined,
          speed: p.speedMph ?? undefined,
        },
        routeName,
        timestamp: Number.isFinite(ts) ? ts : Date.now(),
      });
    }
    return out;
  }, [positions, enabled]);

  const lastUpdated = useMemo(() => {
    if (liveTrains.length === 0) return null;
    let maxTimestamp: number | null = null;
    for (const train of liveTrains) {
      if (train.timestamp != null && (maxTimestamp === null || train.timestamp > maxTimestamp)) {
        maxTimestamp = train.timestamp;
      }
    }
    return maxTimestamp;
  }, [liveTrains]);

  return {
    liveTrains,
    loading: liveTrains.length === 0,
    error: null as Error | null,
    lastUpdated,
    refresh: () => Promise.resolve(),
    trainCount: liveTrains.length,
  };
}
