import { Platform } from 'react-native';
import type { Train } from '../types/train';
import { parseTimeToDate } from '../utils/time-formatting';
import { logger } from '../utils/logger';

// Map of "tripId-fromCode-toCode" -> activityId
const activeActivities = new Map<string, string>();

function activityKey(train: Train): string {
  return `${train.tripId}-${train.fromCode}-${train.toCode}`;
}

function getLiveActivityModule(): typeof import('expo-live-activity') | null {
  try {
    return require('expo-live-activity') as typeof import('expo-live-activity');
  } catch {
    return null;
  }
}

export function isSupported(): boolean {
  if (Platform.OS !== 'ios') return false;
  const version = typeof Platform.Version === 'string' ? parseFloat(Platform.Version) : Platform.Version;
  return version >= 16.1;
}

export function isTrainActiveNow(train: Train): boolean {
  if (train.daysAway !== 0) return false;

  const now = new Date();
  const departDate = parseTimeToDate(train.departTime, now);
  const arriveDate = parseTimeToDate(train.arriveTime, now);
  const delay = train.realtime?.delay || 0;

  // Window: 2h before departure through arrival + delay
  const windowStart = new Date(departDate.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = new Date(arriveDate.getTime() + delay * 60 * 1000 + 30 * 60 * 1000); // +30m buffer

  return now >= windowStart && now <= windowEnd;
}

export async function startForTrain(train: Train): Promise<void> {
  if (!isSupported()) return;

  const key = activityKey(train);
  if (activeActivities.has(key)) return;

  try {
    const LA = getLiveActivityModule();
    if (!LA) {
      logger.debug('[LiveActivity] expo-live-activity not available');
      return;
    }

    const delay = train.realtime?.delay ?? 0;
    const status = delay > 0 ? 'delayed' : delay < 0 ? 'early' : 'on-time';

    const activityId = await LA.startActivity({
      data: {
        trainNumber: train.trainNumber,
        routeName: train.routeName,
        fromCode: train.fromCode,
        toCode: train.toCode,
        from: train.from,
        to: train.to,
        departTime: train.departTime,
        arriveTime: train.arriveTime,
      },
      state: {
        delayMinutes: delay,
        status,
        lastUpdated: Date.now(),
      },
    });

    activeActivities.set(key, activityId);
    logger.info(`[LiveActivity] Started for ${train.trainNumber} (${key})`);
  } catch (e) {
    logger.error(`[LiveActivity] Failed to start for ${train.trainNumber}:`, e);
  }
}

export async function updateForTrain(train: Train): Promise<void> {
  if (!isSupported()) return;

  const key = activityKey(train);
  const activityId = activeActivities.get(key);
  if (!activityId) return;

  try {
    const LA = getLiveActivityModule();
    if (!LA) return;

    const delay = train.realtime?.delay ?? 0;
    const status = delay > 0 ? 'delayed' : delay < 0 ? 'early' : 'on-time';

    await LA.updateActivity(activityId, {
      state: {
        delayMinutes: delay,
        status,
        lastUpdated: Date.now(),
      },
    });
  } catch (e) {
    logger.error(`[LiveActivity] Failed to update for ${train.trainNumber}:`, e);
  }
}

export async function endForTrain(tripId: string, fromCode: string, toCode: string): Promise<void> {
  if (!isSupported()) return;

  const key = `${tripId}-${fromCode}-${toCode}`;
  const activityId = activeActivities.get(key);
  if (!activityId) return;

  try {
    const LA = getLiveActivityModule();
    if (!LA) return;

    await LA.endActivity(activityId);
    activeActivities.delete(key);
    logger.info(`[LiveActivity] Ended for ${key}`);
  } catch (e) {
    logger.error(`[LiveActivity] Failed to end for ${key}:`, e);
  }
}

export async function endAll(): Promise<void> {
  for (const [key] of activeActivities) {
    const [tripId, fromCode, toCode] = key.split('-');
    await endForTrain(tripId, fromCode, toCode);
  }
}

export function hasActivityForTrain(train: Train): boolean {
  return activeActivities.has(activityKey(train));
}
