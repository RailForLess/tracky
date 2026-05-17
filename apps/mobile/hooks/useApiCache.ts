/**
 * Hooks that wrap synchronous reads of the api-client cache. Each one
 * subscribes to cache-change notifications so a render fires when a fetch
 * completes, while keeping the component code feeling synchronous.
 *
 * Use these instead of `await getStop(...)` etc. inside components — the
 * hook fires a background fetch on first call and re-renders when data
 * lands. This mirrors the ergonomic of the old gtfsParser.getStop() but
 * is API-backed.
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  getApiCacheVersion,
  getCachedAgency,
  getCachedRoute,
  getCachedStop,
  prefetchAgency,
  prefetchRoute,
  prefetchStop,
  subscribeApiCache,
} from '../services/api-client';
import type { ApiAgency, ApiRoute, ApiStop } from '../types/api';
import { encodeId, tryParseKindedId } from '../utils/ids';

/**
 * Subscribe to api-client cache invalidations. Components that read via
 * `lookupStop`/`lookupAgencyTimezone` (sync, api-stop-cache) should call
 * this once so they re-render when new entries land.
 */
export function useApiCacheVersion(): number {
  return useSyncExternalStore(subscribeApiCache, getApiCacheVersion, getApiCacheVersion);
}

function useCacheVersion(): number {
  return useApiCacheVersion();
}

const DEFAULT_PROVIDER = 'amtrak';

/**
 * `stopKey` may be a typed global id ('s-amtrak-CHI'), a legacy namespaced
 * id ('amtrak:CHI'), or a bare stop code ('CHI') — the latter two are
 * assumed to belong to `providerId`.
 */
export function useStop(stopKey: string | null | undefined, providerId: string = DEFAULT_PROVIDER): ApiStop | undefined {
  useCacheVersion();
  const globalId = stopKey ? toGlobalStopId(stopKey, providerId) : null;
  useEffect(() => {
    if (globalId) prefetchStop(globalId);
  }, [globalId]);
  if (!globalId) return undefined;
  const entry = getCachedStop(globalId);
  return entry?.type === 'stop' ? entry : undefined;
}

function toGlobalStopId(input: string, defaultProvider: string): string {
  if (tryParseKindedId(input, 's')) return input;
  if (input.includes(':')) {
    const [provider, code] = input.split(':', 2);
    return encodeId('s', provider || defaultProvider, code || input);
  }
  return encodeId('s', defaultProvider, input);
}

export function useRoute(routeId: string | null | undefined): ApiRoute | undefined {
  useCacheVersion();
  useEffect(() => {
    if (routeId) prefetchRoute(routeId);
  }, [routeId]);
  if (!routeId) return undefined;
  return getCachedRoute(routeId);
}

export function useAgency(providerId: string = DEFAULT_PROVIDER): ApiAgency | undefined {
  useCacheVersion();
  useEffect(() => {
    prefetchAgency(providerId);
  }, [providerId]);
  return getCachedAgency(providerId);
}
