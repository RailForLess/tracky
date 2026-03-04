import type { NotificationPrefs } from './storage';
import { DEFAULT_NOTIFICATION_PREFS, TrainStorageService } from './storage';
import { BackgroundTaskService } from './background-tasks';
import * as LiveActivityService from './live-activity';
import * as NotificationService from './notifications';
import type { Train } from '../types/train';
import { parseTimeToDate } from '../utils/time-formatting';
import { logger } from '../utils/logger';

// Cached prefs — refreshed on startup and when changed
let cachedPrefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS;

// Track which trains we've already sent arrival alerts for (to avoid duplicates)
const sentArrivalAlerts = new Set<string>();

function trainKey(train: Train): string {
  return `${train.tripId}-${train.fromCode}-${train.toCode}`;
}

async function loadPrefs(): Promise<NotificationPrefs> {
  cachedPrefs = await TrainStorageService.getNotificationPrefs();
  return cachedPrefs;
}

function hasAnyFeatureEnabled(prefs: NotificationPrefs): boolean {
  return (
    prefs.morningAlerts || prefs.departureReminders || prefs.delayAlerts || prefs.arrivalAlerts || prefs.liveActivities
  );
}

function isArrived(train: Train): boolean {
  if (train.daysAway !== 0) return false;
  const now = new Date();
  const arriveDate = parseTimeToDate(train.arriveTime, now);
  const delay = train.realtime?.arrivalDelay ?? train.realtime?.delay ?? 0;
  const adjustedArrival = new Date(arriveDate.getTime() + delay * 60 * 1000);
  return now >= adjustedArrival;
}

export const TrainActivityManager = {
  async onTrainSaved(train: Train): Promise<void> {
    const prefs = await loadPrefs();
    if (!hasAnyFeatureEnabled(prefs)) return;

    if (prefs.morningAlerts || prefs.departureReminders) {
      await NotificationService.scheduleAllForTrain(train);
    }

    if (prefs.liveActivities && LiveActivityService.isTrainActiveNow(train)) {
      await LiveActivityService.startForTrain(train);
    }
  },

  async onTrainDeleted(tripId: string, fromCode: string, toCode: string): Promise<void> {
    await NotificationService.cancelRemindersForTrain(tripId, fromCode, toCode);
    await LiveActivityService.endForTrain(tripId, fromCode, toCode);
    sentArrivalAlerts.delete(`${tripId}-${fromCode}-${toCode}`);
  },

  async onTrainArchived(train: Train): Promise<void> {
    await NotificationService.cancelRemindersForTrain(train.tripId || '', train.fromCode, train.toCode);
    await LiveActivityService.endForTrain(train.tripId || '', train.fromCode, train.toCode);
    sentArrivalAlerts.delete(trainKey(train));
  },

  async onRealtimeUpdate(oldTrains: Train[], newTrains: Train[]): Promise<void> {
    const prefs = cachedPrefs;
    if (!hasAnyFeatureEnabled(prefs)) return;

    for (const newTrain of newTrains) {
      if (newTrain.daysAway !== 0) continue;

      const key = trainKey(newTrain);
      const oldTrain = oldTrains.find(
        t => t.tripId === newTrain.tripId && t.fromCode === newTrain.fromCode && t.toCode === newTrain.toCode
      );

      // Delay alerts
      if (prefs.delayAlerts && oldTrain && oldTrain.realtime?.delay != null && newTrain.realtime?.delay != null) {
        const oldDelay = oldTrain.realtime.delay;
        const newDelay = newTrain.realtime.delay;
        if (Math.abs(newDelay - oldDelay) >= 5) {
          await NotificationService.sendDelayAlert(newTrain, oldDelay, newDelay);
        }
      }

      // Update Live Activities
      if (prefs.liveActivities) {
        if (LiveActivityService.hasActivityForTrain(newTrain)) {
          await LiveActivityService.updateForTrain(newTrain);
        } else if (LiveActivityService.isTrainActiveNow(newTrain)) {
          await LiveActivityService.startForTrain(newTrain);
        }
      }

      // Arrival detection
      if (prefs.arrivalAlerts && !sentArrivalAlerts.has(key) && isArrived(newTrain)) {
        sentArrivalAlerts.add(key);
        await NotificationService.sendArrivalAlert(newTrain);

        if (prefs.liveActivities) {
          await LiveActivityService.endForTrain(newTrain.tripId || '', newTrain.fromCode, newTrain.toCode);
        }
      }
    }
  },

  async onAppStartup(trains: Train[]): Promise<void> {
    const prefs = await loadPrefs();
    if (!hasAnyFeatureEnabled(prefs)) return;

    // Start Live Activities for currently active trains
    if (prefs.liveActivities) {
      for (const train of trains) {
        if (LiveActivityService.isTrainActiveNow(train)) {
          await LiveActivityService.startForTrain(train);
        }
      }
    }

    // Register background task if any feature needs it
    if (prefs.delayAlerts || prefs.arrivalAlerts || prefs.liveActivities) {
      await BackgroundTaskService.register();
    }

    logger.info(`[TrainActivityManager] Startup complete, ${trains.length} trains`);
  },

  async onPrefsChanged(prefs: NotificationPrefs, trains: Train[]): Promise<void> {
    cachedPrefs = prefs;
    await TrainStorageService.saveNotificationPrefs(prefs);

    if (!hasAnyFeatureEnabled(prefs)) {
      await NotificationService.cancelAllReminders();
      await LiveActivityService.endAll();
      await BackgroundTaskService.unregister();
      return;
    }

    // Reschedule notifications based on new prefs
    if (prefs.morningAlerts || prefs.departureReminders) {
      await NotificationService.rescheduleAllReminders(trains);
    } else {
      await NotificationService.cancelAllReminders();
    }

    // Manage Live Activities
    if (prefs.liveActivities) {
      for (const train of trains) {
        if (LiveActivityService.isTrainActiveNow(train) && !LiveActivityService.hasActivityForTrain(train)) {
          await LiveActivityService.startForTrain(train);
        }
      }
    } else {
      await LiveActivityService.endAll();
    }

    // Register/unregister background task
    if (prefs.delayAlerts || prefs.arrivalAlerts || prefs.liveActivities) {
      await BackgroundTaskService.register();
    } else {
      await BackgroundTaskService.unregister();
    }
  },
};
