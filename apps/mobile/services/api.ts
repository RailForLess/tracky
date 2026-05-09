/**
 * Train data access layer. Backend-API-backed; thin adapter from the
 * spec.* response shapes (types/api.ts) to the consumer-facing Train /
 * Stop / EnrichedStopTime shapes (types/train.ts).
 *
 * Realtime data is read non-reactively from the WebSocket client's cached
 * snapshot — the source of truth for the WS feed lives in services/ws-client.
 */

import type { EnrichedStopTime, Stop, Train } from '../types/train';
import type {
  ApiDepartureItem,
  ApiEnrichedStopTime,
  ApiStop,
  ApiTrainPosition,
  ApiTrip,
} from '../types/api';
import {
  ApiError,
  getCachedRoute,
  getDepartures,
  getStop,
  getTrip,
  getTripStops,
  lookupTrips,
  prefetchRoute,
} from './api-client';
import { wsClient } from './ws-client';
import { formatTime, formatTimeWithDayOffset, type FormattedTime } from '../utils/time-formatting';
import { convertGtfsTimeForStop } from '../utils/timezone';
import { extractDateFromTripId, extractTrainNumber, isLikelyTrainNumber } from '../utils/train-helpers';
import { calculateDaysAway, formatDateForDisplay, getDaysAwayLabel } from '../utils/date-helpers';
import { logger } from '../utils/logger';

// Re-export for backwards compatibility
export { formatTime, formatTimeWithDayOffset, extractTrainNumber, isLikelyTrainNumber };
export type { FormattedTime };

// Until multi-provider support lands, all legacy call sites assume Amtrak.
const DEFAULT_PROVIDER = 'amtrak';

/** Deterministic numeric hash from a string (avoids Date.now() collisions). */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function isNamespaced(id: string): boolean {
  return id.includes(':');
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoToEpochMs(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

function safeAwait<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((err: unknown) => {
    if (!(err instanceof ApiError && err.status === 404)) {
      logger.warn(`[api] request failed`, err);
    }
    return fallback;
  });
}

// ── Adapters: api types → existing types ──────────────────────────────────

function adaptStop(s: ApiStop): Stop {
  return {
    stop_id: s.code,
    stop_name: s.name,
    stop_lat: s.lat,
    stop_lon: s.lon,
    stop_timezone: s.timezone ?? undefined,
  };
}

function adaptStopTime(et: ApiEnrichedStopTime): EnrichedStopTime {
  return {
    trip_id: et.tripId,
    arrival_time: et.arrivalTime ?? '',
    departure_time: et.departureTime ?? et.arrivalTime ?? '',
    stop_id: et.stopCode,
    stop_sequence: et.stopSequence,
    pickup_type: et.pickupType ?? undefined,
    drop_off_type: et.dropOffType ?? undefined,
    timepoint: et.timepoint == null ? undefined : et.timepoint ? 1 : 0,
    stop_name: et.stopName,
    stop_code: et.stopCode,
  };
}

// ── Display name helpers ───────────────────────────────────────────────────

/**
 * Display info for a train. Reads from the in-memory route cache; if the
 * routeId hasn't been fetched yet, kicks off a background fetch and falls
 * back to a short label so the UI doesn't show empty space.
 */
export function getTrainDisplayName(
  tripIdOrTrainNumber: string,
  knownTrainNumber?: string,
  knownRouteId?: string,
): {
  routeName: string | null;
  trainNumber: string;
  displayName: string;
} {
  const trainNumber =
    knownTrainNumber || extractTrainNumber(tripIdOrTrainNumber) || '';

  let routeName: string | null = null;
  if (knownRouteId) {
    prefetchRoute(knownRouteId);
    routeName = getCachedRoute(knownRouteId)?.longName ?? null;
  }

  const displayName = routeName
    ? `${routeName}${trainNumber ? ' ' + trainNumber : ''}`
    : trainNumber
    ? `Amtrak ${trainNumber}`
    : 'Amtrak';

  return { routeName, trainNumber, displayName };
}

// ── Realtime helpers (read-only snapshot from ws-client) ───────────────────

function findPositionForTrain(args: {
  tripId?: string;
  trainNumber?: string;
}): ApiTrainPosition | undefined {
  return wsClient.findPosition({
    provider: DEFAULT_PROVIDER,
    tripId: args.tripId,
    trainNumber: args.trainNumber,
  });
}

function attachRealtime(train: Train): Train {
  const pos = findPositionForTrain({
    tripId: train.tripId,
    trainNumber: train.trainNumber,
  });
  if (!pos) {
    return { ...train, realtime: undefined };
  }
  return {
    ...train,
    realtime: {
      position:
        pos.lat != null && pos.lon != null ? { lat: pos.lat, lon: pos.lon } : undefined,
      // delay/arrivalDelay are populated by /v1/runs/{...}/stops which isn't
      // wired yet. Until then we leave them undefined; status text is computed
      // from delay so it's also blank.
      lastUpdated: isoToEpochMs(pos.lastUpdated),
    },
  };
}

// ── Trip → Train conversion ────────────────────────────────────────────────

async function buildTrainFromTrip(
  trip: ApiTrip,
  stops: EnrichedStopTime[],
  effectiveDate?: Date,
): Promise<Train | null> {
  if (stops.length === 0) {
    logger.debug(`[api] buildTrainFromTrip(${trip.tripId}): no stop times`);
    return null;
  }

  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  // Warm route cache so display name resolves once it lands
  prefetchRoute(trip.routeId);
  const route = getCachedRoute(trip.routeId);
  const routeName = route?.longName || route?.shortName || '';

  const departFormatted = convertGtfsTimeForStop(firstStop.departure_time, firstStop.stop_id);
  const arriveFormatted = convertGtfsTimeForStop(lastStop.arrival_time, lastStop.stop_id);

  const train: Train = {
    id: simpleHash(trip.tripId),
    operator: 'Amtrak',
    trainNumber: trip.shortName || extractTrainNumber(trip.tripId) || '',
    from: firstStop.stop_name,
    to: lastStop.stop_name,
    fromCode: firstStop.stop_id,
    toCode: lastStop.stop_id,
    departTime: departFormatted.time,
    arriveTime: arriveFormatted.time,
    departDayOffset: departFormatted.dayOffset,
    arriveDayOffset: arriveFormatted.dayOffset,
    date: effectiveDate ? getDaysAwayLabel(calculateDaysAway(effectiveDate)) : 'Today',
    daysAway: effectiveDate ? calculateDaysAway(effectiveDate) : 0,
    travelDate: effectiveDate ? effectiveDate.getTime() : undefined,
    routeName,
    tripId: trip.tripId,
    intermediateStops: stops.slice(1, -1).map(stop => {
      const formatted = convertGtfsTimeForStop(stop.departure_time, stop.stop_id);
      return {
        time: formatted.time,
        name: stop.stop_name,
        code: stop.stop_id,
      };
    }),
  };

  if (train.daysAway <= 0) {
    return attachRealtime(train);
  }
  return train;
}

/**
 * Fallback when /v1/trips/{tripId}/stops is unavailable: build a Train
 * carrying just the user's stop time (from the DepartureItem row).
 *
 * The DepartureBoardModal looks up the time at this station via
 * intermediateStops[].code; we synthesize a single intermediate so that
 * lookup still succeeds. from/to are blank since we don't know the trip's
 * actual origin or destination without /v1/trips/{tripId}/stops.
 */
function buildMinimalTrainFromDeparture(
  d: ApiDepartureItem,
  userStopCode: string,
  effectiveDate: Date,
): Train {
  prefetchRoute(d.routeId);
  const route = getCachedRoute(d.routeId);
  const routeName = route?.longName || route?.shortName || '';

  const userTime =
    d.departureTime != null
      ? convertGtfsTimeForStop(d.departureTime, userStopCode)
      : d.arrivalTime != null
      ? convertGtfsTimeForStop(d.arrivalTime, userStopCode)
      : { time: '', dayOffset: 0 };

  const train: Train = {
    id: simpleHash(d.tripId),
    operator: 'Amtrak',
    trainNumber: d.shortName || extractTrainNumber(d.tripId) || '',
    from: '',
    to: d.headsign || '',
    fromCode: userStopCode,
    toCode: '',
    departTime: userTime.time,
    arriveTime: userTime.time,
    departDayOffset: userTime.dayOffset,
    arriveDayOffset: userTime.dayOffset,
    date: getDaysAwayLabel(calculateDaysAway(effectiveDate)),
    daysAway: calculateDaysAway(effectiveDate),
    travelDate: effectiveDate.getTime(),
    routeName,
    tripId: d.tripId,
    intermediateStops: [
      { time: userTime.time, name: userStopCode, code: userStopCode },
    ],
  };

  if (train.daysAway <= 0) return attachRealtime(train);
  return train;
}

// ── Public API ─────────────────────────────────────────────────────────────

export class TrainAPIService {
  /**
   * Get train details for a specific trip. tripId may be:
   *   - the namespaced API id (e.g. "amtrak:5_2026-05-08")
   *   - a bare train number (e.g. "5") — resolved via lookupTrips
   */
  static async getTrainDetails(
    tripId: string,
    date?: Date,
    knownTrainNumber?: string,
  ): Promise<Train | null> {
    try {
      let trip: ApiTrip | null = null;

      if (isNamespaced(tripId)) {
        trip = await safeAwait<ApiTrip | null>(getTrip(tripId), null);
      }

      if (!trip) {
        const trainNumber = knownTrainNumber || extractTrainNumber(tripId);
        if (!trainNumber) {
          logger.debug(`[api] getTrainDetails(${tripId}): cannot extract train number`);
          return null;
        }
        const inferredDate = date ?? extractDateFromTripId(tripId) ?? new Date();
        const trips = await safeAwait<ApiTrip[]>(
          lookupTrips({
            provider: DEFAULT_PROVIDER,
            trainNumber,
            date: toYMD(inferredDate),
          }),
          [],
        );
        trip = trips[0] ?? null;
      }

      if (!trip) {
        logger.debug(`[api] getTrainDetails(${tripId}): no matching trip`);
        return null;
      }

      const apiStops = await safeAwait<ApiEnrichedStopTime[]>(getTripStops(trip.tripId), []);
      const stops = apiStops.map(adaptStopTime);

      const effectiveDate = date ?? extractDateFromTripId(trip.tripId) ?? undefined;
      return buildTrainFromTrip(trip, stops, effectiveDate);
    } catch (error) {
      logger.error('Error fetching train details:', error);
      return null;
    }
  }

  /**
   * All trains arriving/departing at a stop on a given date. Issues a
   * fan-out fetch of /v1/trips/{tripId}/stops per departure to populate
   * origin/destination/intermediate stops; if that fan-out fails for a
   * particular trip, we still return a minimal Train (with the user's
   * stop populated from the departure row) so the list never silently
   * empties on a partial backend.
   *
   * The trip-stops endpoint is cached for 1h, so repeated views of busy
   * stations are cheap.
   */
  static async getTrainsForStation(stopId: string, date?: Date): Promise<Train[]> {
    try {
      const effectiveDate = date ?? new Date();
      const provider = stopId.includes(':') ? stopId.split(':', 1)[0] : DEFAULT_PROVIDER;
      const namespaced = stopId.includes(':') ? stopId : `${provider}:${stopId}`;
      const userStopCode = stopId.includes(':') ? stopId.split(':')[1] : stopId;

      const departures = await safeAwait<ApiDepartureItem[]>(
        getDepartures({ stopId: namespaced, date: toYMD(effectiveDate) }),
        [],
      );
      logger.debug(`[api] getTrainsForStation(${stopId}): ${departures.length} departures`);

      const trains = await Promise.all(
        departures.map(async (d): Promise<Train> => {
          const apiStops = await safeAwait<ApiEnrichedStopTime[]>(
            getTripStops(d.tripId),
            [],
          );
          const stops = apiStops.map(adaptStopTime);

          const trip: ApiTrip = {
            providerId: d.providerId,
            tripId: d.tripId,
            routeId: d.routeId,
            serviceId: d.serviceId,
            shortName: d.shortName,
            headsign: d.headsign,
            shapeId: d.shapeId,
            directionId: d.directionId,
          };

          if (stops.length > 0) {
            const train = await buildTrainFromTrip(trip, stops, effectiveDate);
            if (train) return train;
          }

          return buildMinimalTrainFromDeparture(d, userStopCode, effectiveDate);
        }),
      );
      return trains;
    } catch (error) {
      logger.error('Error fetching trains for station:', error);
      return [];
    }
  }

  /** Stop times for a trip — used by storage rehydration of segmented trips. */
  static async getStopTimesForTrip(tripId: string): Promise<EnrichedStopTime[]> {
    try {
      const apiStops = await getTripStops(tripId);
      return apiStops.map(adaptStopTime);
    } catch (error) {
      logger.error('Error fetching stop times:', error);
      return [];
    }
  }

  /** Look up a stop by its raw code (assumes Amtrak until multi-provider). */
  static async getStop(stopId: string): Promise<Stop | null> {
    try {
      const code = stopId.includes(':') ? stopId.split(':')[1] : stopId;
      const provider = stopId.includes(':') ? stopId.split(':')[0] : DEFAULT_PROVIDER;
      const apiStop = await getStop(provider, code);
      return adaptStop(apiStop);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      logger.error('Error fetching stop:', error);
      return null;
    }
  }

  /**
   * Re-attach realtime snapshot data to a saved train. The new flow doesn't
   * poll — the WebSocket pushes — so this is essentially a sync read.
   * Future trains skip realtime to avoid matching today's same-numbered run.
   */
  static async refreshRealtimeData(train: Train): Promise<Train> {
    if (!train.tripId && !train.trainNumber) return train;
    if (train.daysAway > 0) return { ...train, realtime: undefined };
    return attachRealtime(train);
  }
}

// Backwards-compat shim — getRoutes/getStops aren't exposed by the API.
// useFrequentlyUsed should be reworked to use search; until then, this file's
// callers will see an empty list and a warning.
export const _legacyAPIWarning = () => {
  logger.warn(
    '[api] TrainAPIService.getRoutes/getStops are removed; use api-client search/lookups instead',
  );
};

// formatDateForDisplay is re-exported for callers that imported it transitively.
export { formatDateForDisplay };
