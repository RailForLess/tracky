/**
 * Train-related utility functions
 * Consolidated from services/api.ts and services/realtime.ts
 */

import { gtfsParser } from './gtfs-parser';
import { parseTimeToDate } from './time-formatting';
import type { Train } from '../types/train';

/**
 * Extract the departure date embedded in a GTFS-RT trip ID.
 * Trip IDs follow the format "YYYY-MM-DD_CARRIER_NUMBER" (e.g., "2026-03-08_AMTK_5").
 * Returns the parsed Date or null if the format doesn't match.
 */
export function extractDateFromTripId(tripId: string): Date | null {
  const match = tripId.match(/^(\d{4}-\d{2}-\d{2})_/);
  if (!match) return null;
  const date = new Date(match[1] + 'T00:00:00');
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Check if a string looks like a valid Amtrak train number (1-4 digits).
 * Pure-numeric strings with 5+ digits are opaque database IDs, not train numbers.
 */
export function isLikelyTrainNumber(s: string): boolean {
  return /^\d{1,4}$/.test(s);
}

/**
 * Extract the actual train number from a tripId
 * Uses GTFS trips.txt trip_short_name as source of truth
 * Falls back to parsing trip_id if trips data not available
 * Returns null if no valid train number can be extracted
 * @param tripId - GTFS trip identifier
 * @returns Train number string or null
 * @example
 * extractTrainNumber("2026-03-10_AMTK_43") // "43"
 * extractTrainNumber("2151") // "2151"
 * extractTrainNumber("248766") // null (opaque database ID)
 */
export function extractTrainNumber(tripId: string): string | null {
  // 1. GTFS static data (source of truth)
  const fromGtfs = gtfsParser.getTrainNumber(tripId);
  if (fromGtfs && fromGtfs !== tripId && isLikelyTrainNumber(fromGtfs)) {
    return fromGtfs;
  }

  // 2. Structured: trailing number after underscore (YYYY-MM-DD_AMTK_543)
  const underscoreMatch = tripId.match(/_(\d{1,4})$/);
  if (underscoreMatch) return underscoreMatch[1];

  // 3. If input itself is a valid train number
  if (isLikelyTrainNumber(tripId)) return tripId;

  // 4. Cannot safely extract — return null instead of returning garbage
  return null;
}

/**
 * Build wall-clock Date objects for a train's departure and arrival,
 * accounting for multi-day offsets and overnight trains (daysAway < 0).
 */
export function getAdjustedTrainDates(
  train: Pick<Train, 'departTime' | 'arriveTime' | 'departDayOffset' | 'arriveDayOffset' | 'daysAway'>,
  now = new Date(),
): { departDate: Date; arriveDate: Date } {
  const departDate = parseTimeToDate(train.departTime, now);
  const arriveDate = parseTimeToDate(train.arriveTime, now);

  if (train.departDayOffset) {
    departDate.setDate(departDate.getDate() + train.departDayOffset);
  }
  if (train.arriveDayOffset) {
    arriveDate.setDate(arriveDate.getDate() + train.arriveDayOffset);
  }

  // For overnight trains (daysAway < 0), shift both dates back
  if (train.daysAway < 0) {
    departDate.setDate(departDate.getDate() + train.daysAway);
    arriveDate.setDate(arriveDate.getDate() + train.daysAway);
  }

  return { departDate, arriveDate };
}

