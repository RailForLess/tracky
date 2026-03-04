import * as Notifications from 'expo-notifications';
import { stationLoader } from './station-loader';
import { TrainStorageService } from './storage';
import type { Train } from '../types/train';
import { formatDelayStatus, parseTimeToDate } from '../utils/time-formatting';
import { getTimezoneForCoordinates } from '../utils/timezone';
import { fetchCurrentWeather } from '../utils/weather';
import { logger } from '../utils/logger';

// --- Permissions ---

export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// --- Identifier helpers ---

function morningId(train: Train): string {
  return `morning-${train.tripId}-${train.fromCode}-${train.toCode}`;
}

function departureId(train: Train): string {
  return `departure-${train.tripId}-${train.fromCode}-${train.toCode}`;
}

// --- Scheduled notifications ---

export async function scheduleMorningAlert(train: Train): Promise<void> {
  if (!train.travelDate) return;

  const travelDay = new Date(train.travelDate);
  travelDay.setHours(7, 0, 0, 0);

  // Skip if travel date is today and it's already past 7 AM
  if (travelDay.getTime() <= Date.now()) return;

  const delayStatus = train.realtime?.delay != null ? formatDelayStatus(train.realtime.delay) : 'On Time';

  let weatherStr = '';
  const destStation = stationLoader.getStationByCode(train.toCode);
  if (destStation) {
    const weather = await fetchCurrentWeather(destStation.lat, destStation.lon);
    if (weather) {
      weatherStr = ` ${weather.temp}\u00B0 ${weather.condition} at destination.`;
    }
  }

  await Notifications.scheduleNotificationAsync({
    identifier: morningId(train),
    content: {
      title: `Train ${train.trainNumber} \u2022 ${train.fromCode} \u2192 ${train.toCode}`,
      body: `Good morning! Your train today is ${delayStatus.toLowerCase()}.${weatherStr}`,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: travelDay,
    },
  });

  logger.info(`[Notifications] Scheduled morning alert for ${train.trainNumber} at ${travelDay.toISOString()}`);
}

export async function scheduleDepartureReminder(train: Train): Promise<void> {
  if (!train.travelDate) return;

  const travelDay = new Date(train.travelDate);
  const departDate = parseTimeToDate(train.departTime, travelDay);
  if (train.departDayOffset) {
    departDate.setDate(departDate.getDate() + train.departDayOffset);
  }

  // Schedule 2 hours before departure
  const triggerDate = new Date(departDate.getTime() - 2 * 60 * 60 * 1000);
  if (triggerDate.getTime() <= Date.now()) return;

  const delayStatus = train.realtime?.delay != null ? formatDelayStatus(train.realtime.delay) : 'On Time';
  const fullStationName = stationLoader.getStationByCode(train.fromCode)?.name || train.from;

  await Notifications.scheduleNotificationAsync({
    identifier: departureId(train),
    content: {
      title: `Train ${train.trainNumber} departs in 2 hours`,
      body: `Departs from ${fullStationName} at ${train.departTime}. Currently ${delayStatus.toLowerCase()}.`,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  logger.info(`[Notifications] Scheduled departure reminder for ${train.trainNumber} at ${triggerDate.toISOString()}`);
}

export async function scheduleAllForTrain(train: Train): Promise<void> {
  await scheduleMorningAlert(train);
  await scheduleDepartureReminder(train);
}

// --- Immediate notifications ---

export async function sendDelayAlert(train: Train, oldDelay: number, newDelay: number): Promise<void> {
  if (Math.abs(newDelay - oldDelay) < 5) return;

  const oldStatus = formatDelayStatus(oldDelay);
  const newStatus = formatDelayStatus(newDelay);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Train ${train.trainNumber} Delay Update`,
      body: `${train.fromCode} \u2192 ${train.toCode} \u2014 now ${newStatus} (was ${oldStatus})`,
      sound: 'default',
    },
    trigger: null,
  });

  logger.info(`[Notifications] Sent delay alert for ${train.trainNumber}: ${oldStatus} -> ${newStatus}`);
}

export async function sendArrivalAlert(train: Train): Promise<void> {
  const destStation = stationLoader.getStationByCode(train.toCode);
  const fullName = destStation?.name || train.to;

  let weatherStr = '';
  if (destStation) {
    const weather = await fetchCurrentWeather(destStation.lat, destStation.lon);
    if (weather) {
      weatherStr = `${weather.temp}\u00B0 ${weather.condition}. `;
    }
  }

  // Count visits from trip history
  let visitStr = '';
  try {
    const history = await TrainStorageService.getTripHistory();
    const visitCount = history.filter(h => h.toCode === train.toCode).length + 1; // +1 for current trip
    if (visitCount > 1) {
      const suffix = visitCount === 2 ? '2nd' : visitCount === 3 ? '3rd' : `${visitCount}th`;
      visitStr = `This is your ${suffix} time here.`;
    }
  } catch {
    // ignore
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Arrived at ${fullName}!`,
      body: `Train ${train.trainNumber} from ${train.from}. ${weatherStr}${visitStr}`,
      sound: 'default',
    },
    trigger: null,
  });

  logger.info(`[Notifications] Sent arrival alert for ${train.trainNumber} at ${fullName}`);
}

// --- Cancel methods ---

export async function cancelRemindersForTrain(tripId: string, fromCode: string, toCode: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`morning-${tripId}-${fromCode}-${toCode}`);
  await Notifications.cancelScheduledNotificationAsync(`departure-${tripId}-${fromCode}-${toCode}`);
  logger.info(`[Notifications] Cancelled reminders for ${tripId} (${fromCode} -> ${toCode})`);
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  logger.info('[Notifications] Cancelled all scheduled notifications');
}

export async function rescheduleAllReminders(trains: Train[]): Promise<void> {
  await cancelAllReminders();
  for (const train of trains) {
    await scheduleAllForTrain(train);
  }
}
