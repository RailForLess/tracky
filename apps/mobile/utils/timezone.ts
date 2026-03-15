import tzlookup from '@photostructure/tz-lookup';
import type { Stop } from '../types/train';
import { formatTimeWithDayOffset, type FormattedTime } from './time-formatting';
import { logger } from './logger';

/**
 * Convert a Date to minutes-since-midnight in a given IANA timezone.
 * Falls back to device-local time if timezone is null/invalid.
 */
export function getMinutesInTimezone(date: Date, timezone: string | null): number {
  if (!timezone) {
    return date.getHours() * 60 + date.getMinutes();
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

/**
 * Get current time as minutes-since-midnight in a given IANA timezone.
 * Falls back to device-local time if timezone is null/invalid.
 */
export function getCurrentMinutesInTimezone(timezone: string | null): number {
  return getMinutesInTimezone(new Date(), timezone);
}

/**
 * Convert a Date to seconds-since-midnight in a given IANA timezone.
 * Falls back to device-local time if timezone is null/invalid.
 */
export function getSecondsInTimezone(date: Date, timezone: string | null): number {
  if (!timezone) {
    return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const second = parseInt(parts.find(p => p.type === 'second')?.value ?? '0', 10);
    return hour * 3600 + minute * 60 + second;
  } catch {
    return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  }
}

/**
 * Get current time as seconds-since-midnight in a given IANA timezone.
 * Falls back to device-local time if timezone is null/invalid.
 */
export function getCurrentSecondsInTimezone(timezone: string | null): number {
  return getSecondsInTimezone(new Date(), timezone);
}

/**
 * Derive IANA timezone string from geographic coordinates.
 * Returns null if lookup fails.
 */
export function getTimezoneForCoordinates(lat: number, lon: number): string | null {
  try {
    const tz = tzlookup(lat, lon);
    logger.debug('Timezone: coordinate lookup', { lat, lon, tz });
    return tz;
  } catch (e) {
    logger.warn('Timezone: coordinate lookup failed', { lat, lon, error: String(e) });
    return null;
  }
}

/**
 * Return the timezone for a stop: prefer the GTFS stop_timezone field,
 * fall back to a coordinate-based lookup.
 */
export function getTimezoneForStop(stop: Stop): string | null {
  if (stop.stop_timezone) {
    logger.debug('Timezone: using GTFS stop_timezone', { stop_id: stop.stop_id, stop_timezone: stop.stop_timezone });
    return stop.stop_timezone;
  }
  logger.debug('Timezone: stop_timezone empty, falling back to coordinates', { stop_id: stop.stop_id, lat: stop.stop_lat, lon: stop.stop_lon });
  return getTimezoneForCoordinates(stop.stop_lat, stop.stop_lon);
}

/**
 * Convert a GTFS time (in agency timezone) to a stop's local timezone.
 * If stopTz is null or the same as agencyTz, delegates to formatTimeWithDayOffset.
 */
export function convertGtfsTimeToLocal(
  gtfsTime24: string,
  agencyTz: string,
  stopTz: string | null
): FormattedTime {
  if (!stopTz || stopTz === agencyTz) {
    return formatTimeWithDayOffset(gtfsTime24);
  }

  // Parse GTFS time (may be >= 24h for overnight)
  const [hStr, mStr] = gtfsTime24.substring(0, 5).split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const gtfsDayOffset = Math.floor(h / 24);
  h = h % 24;

  // Compute offset difference between agency and stop timezones (in minutes)
  const now = new Date();
  const agencyMinutes = getMinutesInTimezone(now, agencyTz);
  const stopMinutes = getMinutesInTimezone(now, stopTz);
  const offsetDiffMin = stopMinutes - agencyMinutes;

  // Apply offset to the parsed time
  let totalMinutes = h * 60 + m + offsetDiffMin;
  let dayOffset = gtfsDayOffset;

  while (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    dayOffset += 1;
  }
  while (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    dayOffset -= 1;
  }

  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;

  const ampm = newH >= 12 ? 'PM' : 'AM';
  let display = newH % 12;
  if (display === 0) display = 12;

  return {
    time: `${display}:${String(newM).padStart(2, '0')} ${ampm}`,
    dayOffset,
  };
}

/**
 * Convenience: convert a GTFS time to local timezone for a given stop code.
 * Looks up the stop via gtfsParser and derives its timezone.
 * Falls back to formatTimeWithDayOffset if stop not found.
 */
export function convertGtfsTimeForStop(gtfsTime24: string, stopCode: string): FormattedTime {
  // Lazy import to avoid circular dependency
  const { gtfsParser } = require('./gtfs-parser');
  const stop = gtfsParser.getStop(stopCode);
  if (!stop) {
    return formatTimeWithDayOffset(gtfsTime24);
  }
  const stopTz = getTimezoneForStop(stop);
  return convertGtfsTimeToLocal(gtfsTime24, gtfsParser.agencyTimezone, stopTz);
}
