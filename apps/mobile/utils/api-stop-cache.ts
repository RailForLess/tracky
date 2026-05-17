/**
 * Synchronous, API-backed shim that exposes the few read methods we used
 * to lean on `gtfsParser` for. Each call returns immediately from the
 * api-client cache and fires a background fetch on miss; components that
 * call these inside render should also subscribe to cache changes via
 * `useApiCacheVersion` so they re-render when new data arrives.
 *
 * Multi-provider note: until the app supports per-tap provider tracking,
 * bare codes ("CHI") default to Amtrak; otherwise pass a typed global stop
 * id ('s-amtrak-CHI') directly.
 */

import {
  getCachedAgency,
  getCachedStop,
  prefetchAgency,
  prefetchStop,
} from '../services/api-client';
import type { ApiStop } from '../types/api';
import type { Stop } from '../types/train';
import { encodeId, tryParseKindedId } from './ids';

const DEFAULT_PROVIDER = 'amtrak';
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Resolve any of the legal stop-key shapes to a typed global stop id:
 *   - 's-amtrak-CHI'  (already global)
 *   - 'amtrak:CHI'    (legacy namespaced — coerced for back-compat)
 *   - 'CHI'           (bare code — assumed Amtrak)
 *
 * Returns null when the input is empty or unparseable.
 */
function toStopId(input: string | null | undefined): string | null {
  if (!input) return null;
  if (tryParseKindedId(input, 's')) return input;
  if (input.includes(':')) {
    const [provider, code] = input.split(':', 2);
    if (provider && code) return encodeId('s', provider, code);
    return null;
  }
  return encodeId('s', DEFAULT_PROVIDER, input);
}

export function lookupStop(stopKey: string | null | undefined): Stop | undefined {
  const stopId = toStopId(stopKey);
  if (!stopId) return undefined;
  prefetchStop(stopId);
  const s = getCachedStop(stopId);
  if (!s || s.type !== 'stop') return undefined;
  return adapt(s);
}

export function lookupStopName(stopKey: string | null | undefined): string {
  return lookupStop(stopKey)?.stop_name ?? stopKey ?? '';
}

export function lookupAgencyTimezone(operatorId: string = DEFAULT_PROVIDER): string {
  prefetchAgency(operatorId);
  return getCachedAgency(operatorId)?.timezone ?? DEFAULT_TIMEZONE;
}

function adapt(s: ApiStop): Stop {
  return {
    stop_id: s.code,
    stop_name: s.name,
    stop_lat: s.lat,
    stop_lon: s.lon,
    stop_timezone: s.timezone ?? undefined,
  };
}
