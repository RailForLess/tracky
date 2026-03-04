import { useEffect, useRef } from 'react';
import { TrainAPIService } from '../services/api';
import { TrainActivityManager } from '../services/train-activity-manager';
import type { Train } from '../types/train';
import { logger } from '../utils/logger';

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
        setTrainsRef.current(updated);
        TrainActivityManager.onRealtimeUpdate(oldTrains, updated).catch(() => {});
      }
    };

    const timer = setInterval(refresh, intervalMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [intervalMs]); // Only depend on intervalMs, not trains
}
