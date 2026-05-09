/**
 * Realtime enrichment for saved trains. Subscribes to the WebSocket via
 * RealtimeContext and re-attaches latest position data to each saved train
 * whenever the feed updates. No more polling.
 */

import { useEffect, useRef } from 'react';
import { useRealtimePositions } from '../context/RealtimeContext';
import { TrainAPIService } from '../services/api';
import { TrainActivityManager } from '../services/train-activity-manager';
import type { Train } from '../types/train';
import { logger } from '../utils/logger';

function hasRealtimeChanged(a: Train, b: Train): boolean {
  const ar = a.realtime;
  const br = b.realtime;
  if (!ar && !br) return false;
  if (!ar || !br) return true;
  return (
    ar.delay !== br.delay ||
    ar.arrivalDelay !== br.arrivalDelay ||
    ar.status !== br.status ||
    ar.lastUpdated !== br.lastUpdated ||
    ar.position?.lat !== br.position?.lat ||
    ar.position?.lon !== br.position?.lon
  );
}

/**
 * @param trains - current saved trains
 * @param setTrains - state setter for the saved trains list
 * @param _intervalMs - retained for backwards compat; no-op now (WS-driven).
 */
export function useRealtime(
  trains: Train[],
  setTrains: (t: Train[]) => void,
  _intervalMs: number = 20000,
) {
  const positions = useRealtimePositions();
  const trainsRef = useRef(trains);
  trainsRef.current = trains;
  const setTrainsRef = useRef(setTrains);
  setTrainsRef.current = setTrains;

  useEffect(() => {
    const current = trainsRef.current;
    if (current.length === 0) return;
    let cancelled = false;

    (async () => {
      const updated = await Promise.all(current.map(t => TrainAPIService.refreshRealtimeData(t)));
      if (cancelled) return;
      const anyChanged = updated.some((t, i) => hasRealtimeChanged(t, current[i]));
      if (anyChanged) {
        setTrainsRef.current(updated);
      }
      TrainActivityManager.onRealtimeUpdate(current, updated).catch(e =>
        logger.warn('TrainActivityManager.onRealtimeUpdate failed', e),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [positions]);
}
