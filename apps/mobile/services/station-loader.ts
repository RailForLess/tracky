/**
 * Thin synchronous facade over the API-client stop cache.
 *
 * Originally a spatial index initialized from the local GTFS dataset; now a
 * shim that delegates to lookupStop so existing call sites
 * (services/notifications.ts, services/storage.ts) keep their familiar
 * `stationLoader.getStationByCode(code)` shape. lookupStop is itself sync —
 * it returns whatever's in the api-client cache and fires a background
 * fetch on miss — so behavior matches the old loader except entries
 * populate lazily instead of all-at-once.
 */

import { lookupStop } from '../utils/api-stop-cache';

export interface StationBounds {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface VisibleStation extends StationBounds {}

export const stationLoader = {
  getStationByCode(code: string): StationBounds | undefined {
    const stop = lookupStop(code);
    if (!stop) return undefined;
    return {
      id: stop.stop_id,
      name: stop.stop_name,
      lat: stop.stop_lat,
      lon: stop.stop_lon,
    };
  },
};
