/**
 * Synchronous, API-backed shim that exposes the few read methods we used
 * to lean on `gtfsParser` for. Each call returns immediately from the
 * api-client cache and fires a background fetch on miss; components that
 * call these inside render should also subscribe to cache changes via
 * `useApiCacheVersion` so they re-render when new data arrives.
 *
 * Multi-provider note: until the app supports per-tap provider tracking,
 * all lookups assume Amtrak. Pass providerId explicitly when the caller
 * already knows the namespace.
 */

import {
  getCachedAgency,
  getCachedStop,
  prefetchAgency,
  prefetchStop,
} from '../services/api-client';
import type { Stop } from '../types/train';

const DEFAULT_PROVIDER = 'amtrak';
const DEFAULT_TIMEZONE = 'America/New_York';

function splitNamespaced(stopId: string): { provider: string; code: string } {
  const i = stopId.indexOf(':');
  if (i <= 0) return { provider: DEFAULT_PROVIDER, code: stopId };
  return { provider: stopId.slice(0, i), code: stopId.slice(i + 1) };
}

export function lookupStop(stopId: string | null | undefined): Stop | undefined {
  if (!stopId) return undefined;
  const { provider, code } = splitNamespaced(stopId);
  prefetchStop(provider, code);
  const s = getCachedStop(provider, code);
  if (!s) return undefined;
  return {
    stop_id: s.code,
    stop_name: s.name,
    stop_lat: s.lat,
    stop_lon: s.lon,
    stop_timezone: s.timezone ?? undefined,
  };
}

export function lookupStopName(stopId: string | null | undefined): string {
  return lookupStop(stopId)?.stop_name ?? stopId ?? '';
}

export function lookupAgencyTimezone(providerId: string = DEFAULT_PROVIDER): string {
  prefetchAgency(providerId);
  return getCachedAgency(providerId)?.timezone ?? DEFAULT_TIMEZONE;
}
