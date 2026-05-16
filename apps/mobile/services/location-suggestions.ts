/**
 * Location-based suggestions for the search screen empty state.
 *
 * Backed by the new API client. The nearby-stops endpoint is a stub on
 * apps/api today, so this returns no suggestions until the backend lands
 * GET /v1/stops/nearby. Upcoming-train and routes-at-stop derivations
 * fall out of /v1/departures.
 */

import * as Location from 'expo-location';
import { ApiError, getDepartures, getNearbyStops } from './api-client';
import type { Stop } from '../types/train';
import type { ApiDepartureItem, ApiStop } from '../types/api';
import { haversineDistance } from '../utils/distance';
import { encodeId } from '../utils/ids';
import { logger } from '../utils/logger';

export interface LocationSuggestion {
  type: 'station' | 'route' | 'train';
  label: string;
  subtitle: string;
  stop?: Stop;
  routeId?: string;
  trainNumber?: string;
  displayName?: string;
}

let cachedSuggestions: LocationSuggestion[] | null = null;
let initialized = false;

function adaptStop(s: ApiStop): Stop {
  return {
    stop_id: s.stopId,
    stop_name: s.name,
    stop_lat: s.lat,
    stop_lon: s.lon,
    stop_timezone: s.timezone ?? undefined,
  };
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickClosest(stops: ApiStop[], lat: number, lon: number): { stop: ApiStop; distMi: number } | null {
  if (stops.length === 0) return null;
  let best: ApiStop | null = null;
  let bestDist = Infinity;
  for (const s of stops) {
    const d = haversineDistance(lat, lon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best ? { stop: best, distMi: bestDist } : null;
}

function formatTimeFromIso(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

async function initialize(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      logger.info('[LocationSuggestions] Permission denied');
      return;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = location.coords;
    logger.info('[LocationSuggestions] Location received');

    let nearby: ApiStop[] = [];
    try {
      nearby = await getNearbyStops({ lat: latitude, lon: longitude, radiusMeters: 80_000 });
    } catch (err) {
      // Fail gracefully so the search screen renders without suggestions if
      // the backend is unreachable or returns an error.
      if (err instanceof ApiError) {
        logger.warn(`[LocationSuggestions] /v1/stops/nearby failed (${err.status})`);
      } else {
        logger.warn('[LocationSuggestions] nearby stops unavailable', err);
      }
      return;
    }

    const closest = pickClosest(nearby, latitude, longitude);
    if (!closest) return;
    const nearestStop = adaptStop(closest.stop);
    const distLabel = closest.distMi < 1
      ? `${(closest.distMi * 5280).toFixed(0)} ft away`
      : `${closest.distMi.toFixed(1)} mi away`;

    const suggestions: LocationSuggestion[] = [
      {
        type: 'station',
        label: nearestStop.stop_name,
        subtitle: `${nearestStop.stop_id} · ${distLabel}`,
        stop: nearestStop,
      },
    ];

    // Upcoming trains from this stop today (best-effort).
    try {
      const departures = await getDepartures({
        stopId: closest.stop.stopId || encodeId('s', closest.stop.providerId, closest.stop.code),
        date: toYMD(new Date()),
      });
      const upcoming = departures
        .filter((d): d is ApiDepartureItem & { departureTime: string } => Boolean(d.departureTime))
        .slice(0, 2);
      for (const d of upcoming) {
        suggestions.push({
          type: 'train',
          label: `${d.shortName || d.tripId} ${d.headsign}`.trim(),
          subtitle: `Departs ${nearestStop.stop_id} at ${formatTimeFromIso(d.departureTime)}`,
          trainNumber: d.shortName,
          displayName: `${d.shortName || ''} ${d.headsign}`.trim(),
        });
      }
    } catch (err) {
      logger.warn('[LocationSuggestions] departures unavailable', err);
    }

    cachedSuggestions = suggestions;
    logger.info(`[LocationSuggestions] Cached ${suggestions.length} suggestions`);
  } catch (error) {
    logger.error('[LocationSuggestions] Failed:', error);
  }
}

function getCachedSuggestions(): LocationSuggestion[] | null {
  return cachedSuggestions;
}

export const LocationSuggestionsService = { initialize, getCachedSuggestions };
