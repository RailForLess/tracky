/**
 * Calendar sync service for importing trips from device calendars.
 * Scans for events like "Train to Philadelphia" and matches them against GTFS data.
 */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import type { CompletedTrip, SavedTrainRef } from '../types/train';
import { formatDateForDisplay } from '../utils/date-helpers';
import { gtfsParser } from '../utils/gtfs-parser';
import { logger } from '../utils/logger';
import { haversineDistance } from '../utils/distance';
import { formatTime, parseTimeToMinutes } from '../utils/time-formatting';
import { getMinutesInTimezone } from '../utils/timezone';
import { stationLoader } from './station-loader';
import { TrainStorageService } from './storage';


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
  /** Total events returned by the calendar API (before pattern filtering) */
  totalCalendarEvents?: number;
  /** Short reason if parsed is 0 */
  failReason?: 'gtfs_not_loaded' | 'no_calendar_events' | 'no_pattern_match';
}

interface MatchedTrip {
  tripId: string;
  fromStopId: string;
  fromStopName: string;
  toStopId: string;
  toStopName: string;
  departTime: string;
  arriveTime: string;
  trainNumber: string;
  routeName: string;
  eventDate: Date;
}

const TRAIN_EVENT_PATTERN = /train\s+to\s+(.+)/i;
const TIME_TOLERANCE_MINUTES = 15;

/**
 * Request calendar read permission from the user.
 * Returns true if granted.
 */
export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

/**
 * Check if calendar permission is already granted.
 */
export async function hasCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === 'granted';
}

/**
 * Get list of device calendars for the user to pick from.
 */
export async function getDeviceCalendars(): Promise<DeviceCalendar[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.map(cal => ({
    id: cal.id,
    title: cal.title,
    color: cal.color ?? '#999999',
    source:
      Platform.OS === 'ios' ? (cal.source?.name ?? 'Unknown') : (cal.source?.name ?? cal.accessLevel ?? 'Unknown'),
  }));
}

/**
 * Parse GTFS 24h time string (e.g. "14:30:00") to minutes since midnight.
 */
function gtfsTimeToMinutes(gtfsTime: string): number {
  const parts = gtfsTime.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return h * 60 + m;
}

/**
 * Search for a station, trying full name first then stripping trailing state abbreviation.
 */
function resolveStation(name: string) {
  let stations = gtfsParser.searchStations(name);
  if (stations.length === 0) {
    const withoutState = name.replace(/\s+[A-Za-z]{2}$/, '').trim();
    if (withoutState !== name && withoutState.length > 0) {
      stations = gtfsParser.searchStations(withoutState);
    }
  }
  return stations.length > 0 ? stations[0] : null;
}

/**
 * Format a Date into "h:mm AM/PM" display string.
 */
function formatDateToAmPm(date: Date): string {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Extract a CompletedTrip directly from a calendar event without GTFS validation.
 * Used when matchGtfs is false — blindly trusts calendar data.
 */
function extractTripFromEvent(event: Calendar.Event): CompletedTrip | null {
  const match = event.title.match(TRAIN_EVENT_PATTERN);
  if (!match) return null;

  const destination = match[1].trim();
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const eventDate = new Date(startDate);
  eventDate.setHours(0, 0, 0, 0);

  const originLocation = event.location?.trim() || '';

  // Best-effort station name/code resolution (won't fail if GTFS not loaded)
  const destStation = gtfsParser.isLoaded ? resolveStation(destination) : null;
  const originStation = originLocation && gtfsParser.isLoaded ? resolveStation(originLocation) : null;

  let duration: number | undefined;
  if (endDate) {
    duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    if (duration <= 0) duration = undefined;
  }

  let distance: number | undefined;
  if (originStation && destStation) {
    try {
      const fromStn = stationLoader.getStationByCode(originStation.stop_id);
      const toStn = stationLoader.getStationByCode(destStation.stop_id);
      if (fromStn && toStn) {
        distance = haversineDistance(fromStn.lat, fromStn.lon, toStn.lat, toStn.lon);
      }
    } catch { /* best effort */ }
  }

  // Synthetic deterministic trip ID based on event content
  const tripId = `cal-${eventDate.getTime()}-${destination.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  return {
    tripId,
    trainNumber: '',
    routeName: '',
    from: originStation?.stop_name ?? originLocation,
    to: destStation?.stop_name ?? destination,
    fromCode: originStation?.stop_id ?? '',
    toCode: destStation?.stop_id ?? '',
    departTime: formatDateToAmPm(startDate),
    arriveTime: endDate ? formatDateToAmPm(endDate) : '',
    date: formatDateForDisplay(eventDate),
    travelDate: eventDate.getTime(),
    completedAt: Date.now(),
    duration,
    distance,
    syncedFromCalendar: true,
  };
}

/**
 * Normalize a past date to the same day-of-week in the current week.
 * This allows GTFS lookups to succeed for older rides, since the current
 * GTFS cache only covers current/near-future dates but train schedules
 * are consistent week-to-week.
 */
function normalizeToCurrentWeek(date: Date): Date {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const currentDayOfWeek = today.getDay();
  const targetDayOfWeek = date.getDay();
  const diff = targetDayOfWeek - currentDayOfWeek;
  const normalized = new Date(today);
  normalized.setDate(today.getDate() + diff);
  return normalized;
}

/**
 * Match a single calendar event against GTFS data.
 * Uses event location as origin station and title destination.
 * Returns the matched trip info or null if no match found.
 */
function matchEventToTrip(eventTitle: string, eventStartDate: Date, eventLocation?: string): MatchedTrip | null {
  const match = eventTitle.match(TRAIN_EVENT_PATTERN);
  if (!match) return null;

  const destination = match[1].trim();
  const eventDate = new Date(eventStartDate);
  eventDate.setHours(0, 0, 0, 0);
  const gtfsLookupDate = normalizeToCurrentWeek(eventDate);

  const destStation = resolveStation(destination);
  if (!destStation) {
    logger.info(`Calendar sync: no station found for destination "${destination}"`);
    return null;
  }
  logger.info(`Calendar sync: destination "${destination}" → "${destStation.stop_name}" (${destStation.stop_id})`);

  // If event has a location, use it as the origin station
  const originLocation = eventLocation?.trim();
  if (originLocation) {
    const originStation = resolveStation(originLocation);
    if (originStation) {
      logger.info(
        `Calendar sync: origin "${originLocation}" → "${originStation.stop_name}" (${originStation.stop_id})`
      );

      // GTFS times are in the agency timezone — convert event time to that timezone
      const eventMinutesAtOrigin = getMinutesInTimezone(eventStartDate, gtfsParser.agencyTimezone);

      // Use findTripsWithStops for precise origin→destination matching
      const trips = gtfsParser.findTripsWithStops(originStation.stop_id, destStation.stop_id, gtfsLookupDate);
      logger.info(
        `Calendar sync: ${trips.length} trips from ${originStation.stop_id} to ${destStation.stop_id} on ${eventDate.toLocaleDateString()}`
      );

      for (const trip of trips) {
        const departMinutes = gtfsTimeToMinutes(trip.fromStop.departure_time);
        if (Math.abs(departMinutes - eventMinutesAtOrigin) <= TIME_TOLERANCE_MINUTES) {
          const trainNumber = gtfsParser.getTrainNumber(trip.tripId) || '';
          const routeId = gtfsParser.getRouteIdForTrip(trip.tripId);
          const routeName = routeId ? gtfsParser.getRouteName(routeId) : 'Unknown Route';

          return {
            tripId: trip.tripId,
            fromStopId: trip.fromStop.stop_id,
            fromStopName: trip.fromStop.stop_name,
            toStopId: trip.toStop.stop_id,
            toStopName: trip.toStop.stop_name,
            departTime: formatTime(trip.fromStop.departure_time),
            arriveTime: formatTime(trip.toStop.arrival_time),
            trainNumber,
            routeName,
            eventDate,
          };
        }
      }
    } else {
      logger.info(`Calendar sync: no station found for origin "${originLocation}", falling back to time matching`);
    }
  }

  // Fallback: no location or origin not found — infer origin by matching departure time at any stop
  const tripIds = gtfsParser.getTripsForStop(destStation.stop_id, gtfsLookupDate);
  logger.info(
    `Calendar sync: fallback — ${tripIds.length} trips at ${destStation.stop_id}`
  );

  for (const tripId of tripIds) {
    const stopTimes = gtfsParser.getStopTimesForTrip(tripId);
    if (stopTimes.length < 2) continue;

    for (const stop of stopTimes) {
      // GTFS times are in the agency timezone — convert event time to that timezone
      const eventMinutesAtStop = getMinutesInTimezone(eventStartDate, gtfsParser.agencyTimezone);
      const stopMinutes = gtfsTimeToMinutes(stop.departure_time);
      if (Math.abs(stopMinutes - eventMinutesAtStop) <= TIME_TOLERANCE_MINUTES) {
        const destStopTime = stopTimes.find(s => s.stop_id === destStation.stop_id);
        if (!destStopTime) continue;
        if (stop.stop_sequence >= destStopTime.stop_sequence) continue;

        const trainNumber = gtfsParser.getTrainNumber(tripId) || '';
        const routeId = gtfsParser.getRouteIdForTrip(tripId);
        const routeName = routeId ? gtfsParser.getRouteName(routeId) : 'Unknown Route';

        return {
          tripId,
          fromStopId: stop.stop_id,
          fromStopName: stop.stop_name,
          toStopId: destStopTime.stop_id,
          toStopName: destStopTime.stop_name,
          departTime: formatTime(stop.departure_time),
          arriveTime: formatTime(destStopTime.arrival_time),
          trainNumber,
          routeName,
          eventDate,
        };
      }
    }
  }

  return null;
}

/**
 * Fetch events from the Calendar API, chunking into 6-month intervals
 * to avoid iOS EventKit silently truncating results on large date ranges.
 */
async function fetchCalendarEventsChunked(
  calendarIds: string[],
  startDate: Date,
  endDate: Date
): Promise<Calendar.Event[]> {
  const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
  const rangeMs = endDate.getTime() - startDate.getTime();

  // Small range — single fetch is fine
  if (rangeMs <= SIX_MONTHS_MS) {
    return Calendar.getEventsAsync(calendarIds, startDate, endDate);
  }

  // Large range — chunk into 6-month windows
  const allEvents: Calendar.Event[] = [];
  const seenIds = new Set<string>();
  let chunkStart = new Date(startDate);

  while (chunkStart.getTime() < endDate.getTime()) {
    const chunkEnd = new Date(Math.min(chunkStart.getTime() + SIX_MONTHS_MS, endDate.getTime()));
    const chunk = await Calendar.getEventsAsync(calendarIds, chunkStart, chunkEnd);
    for (const event of chunk) {
      const eid = event.id ?? `${event.title}-${event.startDate}`;
      if (!seenIds.has(eid)) {
        seenIds.add(eid);
        allEvents.push(event);
      }
    }
    logger.info(`Calendar sync: chunk ${chunkStart.toLocaleDateString()}–${chunkEnd.toLocaleDateString()}: ${chunk.length} events`);
    chunkStart = chunkEnd;
  }

  return allEvents;
}

/**
 * Fetch train events from calendars within a date range.
 */
async function fetchTrainEvents(
  calendarIds: string[],
  startDate: Date,
  endDate: Date
): Promise<{ matched: Calendar.Event[]; totalEvents: number }> {
  logger.info(
    `Calendar sync: fetching from ${calendarIds.length} calendar(s), ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
  );
  const events = await fetchCalendarEventsChunked(calendarIds, startDate, endDate);
  logger.info(`Calendar sync: ${events.length} total events found`);

  // Log first few event titles for debugging when no matches
  if (events.length > 0 && events.length <= 20) {
    for (const e of events) {
      logger.info(`Calendar sync:   event: "${e.title}"`);
    }
  } else if (events.length > 20) {
    for (let i = 0; i < 10; i++) {
      logger.info(`Calendar sync:   event: "${events[i].title}"`);
    }
    logger.info(`Calendar sync:   ... and ${events.length - 10} more`);
  }

  const matched: Calendar.Event[] = [];
  for (const e of events) {
    if (TRAIN_EVENT_PATTERN.test(e.title)) {
      logger.info(`Calendar sync: matched "${e.title}"`);
      matched.push(e);
    }
  }
  logger.info(`Calendar sync: ${matched.length}/${events.length} matched train pattern`);
  return { matched, totalEvents: events.length };
}

/**
 * Sync past trips — scans selected calendars for past train events
 * and adds matched trips to history.
 */
export async function syncPastTrips(calendarIds: string[], scanDays: number, matchGtfs: boolean = false): Promise<SyncResult> {
  const result: SyncResult = { parsed: 0, matched: 0, added: 0, skipped: 0, addedTrips: [] };

  // When matchGtfs is enabled, require GTFS data for precise trip matching
  if (matchGtfs && !gtfsParser.isLoaded) {
    logger.error('Calendar sync: GTFS data not loaded — cannot sync');
    result.failReason = 'gtfs_not_loaded';
    return result;
  }

  const now = new Date();
  const endDate = new Date(now);
  if (scanDays === -1) {
    // "All" — include through today
    endDate.setHours(23, 59, 59, 999);
  } else {
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);
  }

  const startDate = new Date(now);
  if (scanDays === -1) {
    // "All" option - scan as far back as possible
    startDate.setFullYear(startDate.getFullYear() - 10);
  } else {
    startDate.setDate(startDate.getDate() - scanDays);
  }
  startDate.setHours(0, 0, 0, 0);

  const { matched: trainEvents, totalEvents } = await fetchTrainEvents(calendarIds, startDate, endDate);
  result.parsed = trainEvents.length;
  result.totalCalendarEvents = totalEvents;
  if (trainEvents.length === 0) {
    result.failReason = totalEvents === 0 ? 'no_calendar_events' : 'no_pattern_match';
    return result;
  }

  const existingHistory = await TrainStorageService.getTripHistory();
  const existingKeys = new Set(existingHistory.map(h => `${h.tripId}|${h.fromCode}|${h.toCode}|${h.travelDate}`));

  for (const event of trainEvents) {
    let entry: CompletedTrip | null;

    if (!matchGtfs) {
      // Trust calendar data directly — no GTFS cross-reference
      entry = extractTripFromEvent(event);
    } else {
      // Full GTFS matching path
      const matched = matchEventToTrip(event.title, new Date(event.startDate), event.location ?? undefined);
      if (!matched) { continue; }

      // Calculate duration from times
      let duration: number | undefined;
      try {
        const departMinutes = parseTimeToMinutes(matched.departTime);
        const arriveMinutes = parseTimeToMinutes(matched.arriveTime);
        duration = arriveMinutes - departMinutes;
        if (duration < 0) {
          duration += 24 * 60;
        }
      } catch (error) {
        logger.error('Calendar sync: Error calculating duration:', error);
      }

      // Calculate distance as the crow flies using station coordinates
      let distance: number | undefined;
      try {
        const fromStation = stationLoader.getStationByCode(matched.fromStopId);
        const toStation = stationLoader.getStationByCode(matched.toStopId);
        if (fromStation && toStation) {
          distance = haversineDistance(fromStation.lat, fromStation.lon, toStation.lat, toStation.lon);
        }
      } catch (error) {
        logger.error('Calendar sync: Error calculating distance:', error);
      }

      // Use a stable trip ID derived from matched train info rather than the
      // volatile GTFS trip ID, which changes when timetable data is refreshed.
      // This prevents duplicate history entries when re-syncing after a GTFS update.
      const stableTripId = `cal-${matched.eventDate.getTime()}-${matched.trainNumber || matched.fromStopId}-${matched.toStopId}`;

      entry = {
        tripId: stableTripId,
        trainNumber: matched.trainNumber,
        routeName: matched.routeName,
        from: matched.fromStopName,
        to: matched.toStopName,
        fromCode: matched.fromStopId,
        toCode: matched.toStopId,
        departTime: matched.departTime,
        arriveTime: matched.arriveTime,
        date: formatDateForDisplay(matched.eventDate),
        travelDate: matched.eventDate.getTime(),
        completedAt: Date.now(),
        duration,
        distance,
        syncedFromCalendar: true,
      };
    }

    if (!entry) continue;

    const key = `${entry.tripId}|${entry.fromCode}|${entry.toCode}|${entry.travelDate}`;
    result.matched++;

    if (existingKeys.has(key)) {
      result.skipped++;
    } else {
      const added = await TrainStorageService.addToHistory(entry);
      if (added) {
        result.added++;
        existingKeys.add(key);
        result.addedTrips.push({
          from: entry.from,
          to: entry.to,
          date: entry.date,
        });
      } else {
        result.skipped++;
      }
    }
  }

  return result;
}

/**
 * Sync future trips — scans calendars for upcoming train events
 * and adds matched trips to saved trains (My Trains).
 * Called automatically on app load.
 */
export async function syncFutureTrips(calendarIds: string[], matchGtfs: boolean = false): Promise<SyncResult> {
  const result: SyncResult = { parsed: 0, matched: 0, added: 0, skipped: 0, addedTrips: [] };

  // Future trips are stored as SavedTrainRef which requires a valid GTFS trip ID
  // for reconstruction. Skip when GTFS matching is disabled.
  if (!matchGtfs) {
    logger.info('Calendar sync (future): skipped — GTFS matching disabled');
    return result;
  }

  if (!gtfsParser.isLoaded) {
    logger.error('Calendar sync (future): GTFS data not loaded — cannot sync');
    result.failReason = 'gtfs_not_loaded';
    return result;
  }

  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 90);
  endDate.setHours(23, 59, 59, 999);

  const { matched: trainEvents, totalEvents } = await fetchTrainEvents(calendarIds, startDate, endDate);
  result.parsed = trainEvents.length;
  result.totalCalendarEvents = totalEvents;
  if (trainEvents.length === 0) {
    result.failReason = totalEvents === 0 ? 'no_calendar_events' : 'no_pattern_match';
    return result;
  }

  // Load existing saved trains for dedup
  const existingRefs = await TrainStorageService.getSavedTrainRefs();
  const existingKeys = new Set(
    existingRefs.map(r => `${r.tripId}|${r.fromCode ?? ''}|${r.toCode ?? ''}|${r.travelDate ?? 0}`)
  );

  for (const event of trainEvents) {
    const matched = matchEventToTrip(event.title, new Date(event.startDate), event.location ?? undefined);
    if (!matched) continue;

    result.matched++;

    const ref: SavedTrainRef = {
      tripId: matched.tripId,
      fromCode: matched.fromStopId,
      toCode: matched.toStopId,
      travelDate: matched.eventDate.getTime(),
      savedAt: Date.now(),
    };

    const key = `${ref.tripId}|${ref.fromCode ?? ''}|${ref.toCode ?? ''}|${ref.travelDate ?? 0}`;
    if (existingKeys.has(key)) {
      result.skipped++;
    } else {
      const saved = await TrainStorageService.saveTrainRef(ref);
      if (saved) {
        result.added++;
        existingKeys.add(key);
        result.addedTrips.push({
          from: matched.fromStopName,
          to: matched.toStopName,
          date: formatDateForDisplay(matched.eventDate),
        });
      } else {
        result.skipped++;
      }
    }
  }

  return result;
}
