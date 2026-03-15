import * as Location from 'expo-location';
import type { GTFSParser } from '../utils/gtfs-parser';
import type { Route, Stop } from '../types/train';
import { haversineDistance } from '../utils/distance';
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

async function initialize(parser: GTFSParser): Promise<void> {
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
    logger.info(`[LocationSuggestions] Location: ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);

    // Find nearest station
    const allStops = parser.getAllStops();
    if (allStops.length === 0) return;

    let nearestStop: Stop | null = null;
    let nearestDist = Infinity;
    for (const stop of allStops) {
      const dist = haversineDistance(latitude, longitude, stop.stop_lat, stop.stop_lon);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestStop = stop;
      }
    }

    if (!nearestStop) return;
    logger.info(`[LocationSuggestions] Nearest: ${nearestStop.stop_name} (${nearestDist.toFixed(1)} mi)`);

    const suggestions: LocationSuggestion[] = [];

    // 1. Nearest station
    const distLabel = nearestDist < 1
      ? `${(nearestDist * 5280).toFixed(0)} ft away`
      : `${nearestDist.toFixed(1)} mi away`;
    suggestions.push({
      type: 'station',
      label: nearestStop.stop_name,
      subtitle: `${nearestStop.stop_id} · ${distLabel}`,
      stop: nearestStop,
    });

    // 2. Up to 2 upcoming trains from nearest station
    const upcoming = parser.getUpcomingTrainsFromStop(nearestStop.stop_id, 2);
    for (const train of upcoming) {
      const [hStr, mStr] = train.departureTime.split(':');
      let h = parseInt(hStr, 10);
      const m = mStr;
      const dayOffset = Math.floor(h / 24);
      h = h % 24;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const timeStr = `${h12}:${m} ${ampm}`;

      suggestions.push({
        type: 'train',
        label: `${train.routeName} ${train.trainNumber}`,
        subtitle: `Departs ${nearestStop.stop_id} at ${timeStr}`,
        trainNumber: train.trainNumber,
        displayName: `${train.routeName} ${train.trainNumber}`,
      });
    }

    // 3. Up to 2 routes serving nearest station (skip routes already shown via trains)
    const shownRouteIds = new Set(upcoming.map(t => t.trip.route_id));
    const routes = parser.getRoutesServingStop(nearestStop.stop_id);
    let routeCount = 0;
    for (const route of routes) {
      if (routeCount >= 2) break;
      if (shownRouteIds.has(route.route_id)) continue;
      suggestions.push({
        type: 'route',
        label: route.route_long_name,
        subtitle: `Serves ${nearestStop.stop_id}`,
        routeId: route.route_id,
      });
      routeCount++;
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
