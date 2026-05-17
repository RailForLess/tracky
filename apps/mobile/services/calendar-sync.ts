/**
 * Calendar sync — DISABLED during the GTFS → API migration.
 *
 * The original matching loop relied on local stop_times/calendar joins
 * (gtfsParser.findTripsWithStops, getTripsForStop, getStopTimesForTrip,
 * searchStations, etc.). The API equivalents (/v1/connections,
 * /v1/departures, /v1/search) cover most of it but the port hasn't been
 * done yet. Re-enable in a follow-up — see git history for the original
 * implementation.
 *
 * Permission/listing helpers stay functional so the Settings UI still
 * renders without errors; the two `sync*` entrypoints return an empty
 * SyncResult.
 */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string;
  source: string;
}

export interface AddedTripInfo {
  from: string;
  to: string;
  date: string;
}

export interface SyncResult {
  parsed: number;
  matched: number;
  added: number;
  skipped: number;
  addedTrips: AddedTripInfo[];
  totalCalendarEvents?: number;
  failReason?: 'gtfs_not_loaded' | 'no_calendar_events' | 'no_pattern_match';
}

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function hasCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === 'granted';
}

export async function getDeviceCalendars(): Promise<DeviceCalendar[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.map(cal => ({
    id: cal.id,
    title: cal.title,
    color: cal.color ?? '#999999',
    source:
      Platform.OS === 'ios'
        ? (cal.source?.name ?? 'Unknown')
        : (cal.source?.name ?? cal.accessLevel ?? 'Unknown'),
  }));
}

const DISABLED_RESULT: SyncResult = {
  parsed: 0,
  matched: 0,
  added: 0,
  skipped: 0,
  addedTrips: [],
  totalCalendarEvents: 0,
  failReason: 'gtfs_not_loaded',
};

export async function syncPastTrips(
  _calendarIds: string[],
  _scanDays: number,
  _matchGtfs: boolean = false,
): Promise<SyncResult> {
  logger.info('Calendar sync (past): disabled during GTFS → API migration');
  return DISABLED_RESULT;
}

export async function syncFutureTrips(
  _calendarIds: string[],
  _matchGtfs: boolean = false,
): Promise<SyncResult> {
  logger.info('Calendar sync (future): disabled during GTFS → API migration');
  return DISABLED_RESULT;
}
