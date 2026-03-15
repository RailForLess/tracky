import { useEffect, useRef } from 'react';
import { TrainAPIService } from '../services/api';
import { TrainActivityManager } from '../services/train-activity-manager';
import type { Train } from '../types/train';
import { logger } from '../utils/logger';

/** Compare realtime-changing fields to detect if a train actually changed */
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

export function useRealtime(trains: Train[], setTrains: (t: Train[]) => void, intervalMs: number = 20000) {
  // Use ref to avoid resetting interval when trains change
  const trainsRef = useRef(trains);
  trainsRef.current = trains;

  const setTrainsRef = useRef(setTrains);
  setTrainsRef.current = setTrains;

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      if (trainsRef.current.length === 0) return;
      logger.debug(`[Realtime] Refreshing ${trainsRef.current.length} saved trains`);
      const oldTrains = trainsRef.current;
      const updated = await Promise.all(trainsRef.current.map(t => TrainAPIService.refreshRealtimeData(t)));
      if (mounted) {
        // Only trigger re-render if any train's realtime data actually changed
        const anyChanged = updated.some((t, i) => hasRealtimeChanged(t, oldTrains[i]));
        if (anyChanged) {
          setTrainsRef.current(updated);
        }
        TrainActivityManager.onRealtimeUpdate(oldTrains, updated).catch(e => logger.warn('TrainActivityManager.onRealtimeUpdate failed', e));
      }
    };

    const timer = setInterval(refresh, intervalMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [intervalMs]); // Only depend on intervalMs, not trains
}
