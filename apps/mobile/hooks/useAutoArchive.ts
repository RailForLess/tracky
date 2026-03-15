import { useEffect } from 'react';
import { Alert } from 'react-native';
import { hasCalendarPermission, syncFutureTrips } from '../services/calendar-sync';
import { TrainStorageService } from '../services/storage';
import { TrainActivityManager } from '../services/train-activity-manager';
import type { Train } from '../types/train';
import { POST_ARRIVAL_GRACE_MS } from '../constants/map';
import { parseTimeToDate } from '../utils/time-formatting';
import { logger } from '../utils/logger';

/**
 * Determines if a train should be auto-archived based on travel date and arrival time.
 * Handles overnight trains with day offsets.
 */
export function shouldArchiveTrain(train: Train, now: Date): boolean {
  if (!train.daysAway && train.daysAway !== 0) return false;

  // For overnight trains (daysAway < 0), check if arrival has actually passed
  if (train.daysAway < 0 && train.arriveTime) {
    const arriveDate = parseTimeToDate(train.arriveTime, now);
    // arriveDayOffset is relative to departure day; shift to today's frame.
    // e.g. departed yesterday (daysAway=-1) arriving +1 day after departure
    //      → arrivalDayFromToday = 1 + (-1) = 0 → arriving today
    const arrivalDayFromToday = (train.arriveDayOffset ?? 0) + train.daysAway;
    arriveDate.setDate(arriveDate.getDate() + arrivalDayFromToday);
    return arriveDate.getTime() + POST_ARRIVAL_GRACE_MS < now.getTime();
  }

  // Yesterday or earlier with no arrival time — definitely past
  if (train.daysAway < 0) return true;

  // Today — archive only after grace period past arrival time
  if (train.daysAway === 0 && train.arriveTime) {
    const arriveDate = parseTimeToDate(train.arriveTime, now);
    return arriveDate.getTime() + POST_ARRIVAL_GRACE_MS < now.getTime();
  }

  return false;
}

/**
 * Hook that auto-archives past trips and syncs calendar trips on startup.
 * Extracted from ModalContent to separate concerns.
 */
export function useAutoArchive(
  isLoadingCache: boolean,
  setSavedTrains: (trains: Train[] | ((prev: Train[]) => Train[])) => void,
) {
  useEffect(() => {
    if (isLoadingCache) return;
    let cancelled = false;

    const loadAndArchive = async () => {
      logger.info('[App] Loading saved trains from storage');
      const trains = await TrainStorageService.getSavedTrains();
      if (cancelled) return;
      logger.info(`[App] Loaded ${trains.length} saved trains`);

      // Auto-archive past trips
      const now = new Date();
      const pastTrains = trains.filter(t => shouldArchiveTrain(t, now));

      if (pastTrains.length > 0) {
        logger.info(`[App] Auto-archiving ${pastTrains.length} past trains`);
      }
      for (const train of pastTrains) {
        await TrainStorageService.moveToHistory(train);
        TrainActivityManager.onTrainArchived(train).catch(e =>
          logger.warn('TrainActivityManager.onTrainArchived failed', e)
        );
      }
      if (cancelled) return;

      if (pastTrains.length > 0) {
        const updatedTrains = await TrainStorageService.getSavedTrains();
        if (cancelled) return;
        setSavedTrains(updatedTrains);
        TrainActivityManager.onAppStartup(updatedTrains).catch(e =>
          logger.warn('TrainActivityManager.onAppStartup failed', e)
        );
      } else {
        setSavedTrains(trains);
        TrainActivityManager.onAppStartup(trains).catch(e =>
          logger.warn('TrainActivityManager.onAppStartup failed', e)
        );
      }

      // Auto-sync future trips from calendar (if permission already granted)
      try {
        const permitted = await hasCalendarPermission();
        if (cancelled) return;
        if (permitted) {
          const prefs = await TrainStorageService.getCalendarSyncPrefs();
          if (cancelled) return;
          if (prefs && prefs.calendarIds.length > 0) {
            logger.info(`[Calendar] Auto-syncing future trips from ${prefs.calendarIds.length} calendars`);
            const syncResult = await syncFutureTrips(prefs.calendarIds, prefs.matchGtfs ?? false);
            if (cancelled) return;
            logger.info(`[Calendar] Sync result: ${syncResult.added} added, ${syncResult.skipped} skipped`);
            if (syncResult.added > 0) {
              const refreshed = await TrainStorageService.getSavedTrains();
              if (cancelled) return;
              setSavedTrains(refreshed);
              const tripLines = syncResult.addedTrips.map(t => `${t.from} → ${t.to} (${t.date})`).join('\n');
              Alert.alert('Trips Found from Calendar', tripLines);
            }
          }
        }
      } catch (e) {
        logger.error('Auto calendar sync failed:', e);
      }
    };

    loadAndArchive();
    return () => { cancelled = true; };
  }, [setSavedTrains, isLoadingCache]);
}
