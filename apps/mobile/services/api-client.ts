/**
 * Typed client for the Tracky backend REST API at `apiUrl` (config.ts).
 *
 * Path structure mirrors apps/api routes — see /v1/* in apps/api/routes/static.go
 * for endpoint definitions and apps/api/db/static_read.go for response shapes.
 *
 * Static lookups are cached in-memory for 1 hour (matches server Cache-Control).
 * Time-sensitive endpoints (departures, lookups, runs) skip the cache.
 */

import { config } from '../constants/config';
import { fetchWithTimeout } from '../utils/fetch-with-timeout';
import type {
  ApiActiveTrain,
  ApiAgency,
  ApiConnectionItem,
  ApiDepartureItem,
  ApiEnrichedStopTime,
  ApiRoute,
  ApiSearchHitType,
  ApiSearchResult,
  ApiServiceInfo,
  ApiStop,
  ApiTrainItem,
  ApiTrainStopTime,
  ApiTrip,
} from '../types/api';

const STATIC_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 12_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

async function request<T>(
  path: string,
  opts: { cacheKey?: string; ttlMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  if (opts.cacheKey) {
    const hit = getCached<T>(opts.cacheKey);
    if (hit !== undefined) return hit;
  }

  const url = `${config.apiUrl}${path}`;
  const res = await fetchWithTimeout(url, { timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body was not JSON; keep status-only message
    }
    throw new ApiError(res.status, path, message);
  }

  const value = (await res.json()) as T;
  if (opts.cacheKey && opts.ttlMs) {
    setCached(opts.cacheKey, value, opts.ttlMs);
  }
  return value;
}

// ── Providers ──────────────────────────────────────────────────────────────

export function getProvider(providerId: string): Promise<ApiAgency> {
  return request<ApiAgency>(`/v1/providers/${encodeURIComponent(providerId)}`, {
    cacheKey: `provider:${providerId}`,
    ttlMs: STATIC_TTL_MS,
  });
}

// ── Stops ──────────────────────────────────────────────────────────────────

export function getStop(providerId: string, stopCode: string): Promise<ApiStop> {
  return request<ApiStop>(
    `/v1/stops/${encodeURIComponent(providerId)}/${encodeURIComponent(stopCode)}`,
    { cacheKey: `stop:${providerId}:${stopCode}`, ttlMs: STATIC_TTL_MS },
  );
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function getRoute(providerId: string, routeCode: string): Promise<ApiRoute> {
  return request<ApiRoute>(
    `/v1/routes/${encodeURIComponent(providerId)}/${encodeURIComponent(routeCode)}`,
    { cacheKey: `route:${providerId}:${routeCode}`, ttlMs: STATIC_TTL_MS },
  );
}

export function getRoutes(providerId: string): Promise<ApiRoute[]> {
  const qs = buildQuery({ provider: providerId });
  return request<ApiRoute[]>(`/v1/routes${qs}`, {
    cacheKey: `routes:${providerId}`,
    ttlMs: STATIC_TTL_MS,
  });
}

export function getTrainsForRoute(
  providerId: string,
  routeCode: string,
): Promise<ApiTrainItem[]> {
  return request<ApiTrainItem[]>(
    `/v1/routes/${encodeURIComponent(providerId)}/${encodeURIComponent(routeCode)}/trains`,
    { cacheKey: `routeTrains:${providerId}:${routeCode}`, ttlMs: STATIC_TTL_MS },
  );
}

// ── Trips ──────────────────────────────────────────────────────────────────

export function getTrip(tripId: string): Promise<ApiTrip> {
  return request<ApiTrip>(`/v1/trips/${encodeURIComponent(tripId)}`, {
    cacheKey: `trip:${tripId}`,
    ttlMs: STATIC_TTL_MS,
  });
}

export function getTripStops(tripId: string): Promise<ApiEnrichedStopTime[]> {
  return request<ApiEnrichedStopTime[]>(`/v1/trips/${encodeURIComponent(tripId)}/stops`, {
    cacheKey: `tripStops:${tripId}`,
    ttlMs: STATIC_TTL_MS,
  });
}

export function lookupTrips(params: {
  provider: string;
  trainNumber: string;
  date: string;
}): Promise<ApiTrip[]> {
  const qs = buildQuery({
    provider: params.provider,
    train_number: params.trainNumber,
    date: params.date,
  });
  return request<ApiTrip[]>(`/v1/trips/lookup${qs}`);
}

// ── Departures & connections ───────────────────────────────────────────────

export function getDepartures(params: {
  stopId: string;
  date: string;
}): Promise<ApiDepartureItem[]> {
  const qs = buildQuery({ stop_id: params.stopId, date: params.date });
  return request<ApiDepartureItem[]>(`/v1/departures${qs}`);
}

export function getConnections(params: {
  fromStop: string;
  toStop: string;
  date: string;
}): Promise<ApiConnectionItem[]> {
  const qs = buildQuery({
    from_stop: params.fromStop,
    to_stop: params.toStop,
    date: params.date,
  });
  return request<ApiConnectionItem[]>(`/v1/connections${qs}`);
}

// ── Train service ──────────────────────────────────────────────────────────

export function getTrainService(
  trainNumber: string,
  params: { provider: string; from?: string; to?: string },
): Promise<ApiServiceInfo> {
  const qs = buildQuery({ provider: params.provider, from: params.from, to: params.to });
  return request<ApiServiceInfo>(
    `/v1/trains/${encodeURIComponent(trainNumber)}/service${qs}`,
  );
}

// ── Search ─────────────────────────────────────────────────────────────────

export function search(params: {
  q: string;
  provider?: string;
  types?: ApiSearchHitType[];
}): Promise<ApiSearchResult> {
  const qs = buildQuery({
    q: params.q,
    provider: params.provider,
    types: params.types?.join(','),
  });
  return request<ApiSearchResult>(`/v1/search${qs}`);
}

// ── Realtime ───────────────────────────────────────────────────────────────

/**
 * Per-stop scheduled + estimated + actual times for a specific run of a trip.
 * Powers TrainDetailModal's per-stop delay timeline. Uncached — realtime data.
 */
export function getRunStops(params: {
  provider: string;
  tripId: string;
  runDate: string;
}): Promise<ApiTrainStopTime[]> {
  const { provider, tripId, runDate } = params;
  return request<ApiTrainStopTime[]>(
    `/v1/runs/${encodeURIComponent(provider)}/${encodeURIComponent(tripId)}/${encodeURIComponent(runDate)}/stops`,
  );
}

/**
 * Currently-tracked runs for a provider, sourced from the latest realtime
 * snapshot the backend has published. Used by the "live only" filter in the
 * trip search; cheap enough to call on demand without caching.
 */
export function getActiveTrains(provider: string): Promise<ApiActiveTrain[]> {
  const qs = buildQuery({ provider });
  return request<{ activeTrains: ApiActiveTrain[] }>(`/v1/active${qs}`).then(
    r => r.activeTrains,
  );
}

/**
 * Stops near a location across all providers, for "nearest station" suggestions.
 */
export function getNearbyStops(params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  provider?: string;
}): Promise<ApiStop[]> {
  const qs = buildQuery({
    lat: params.lat,
    lon: params.lon,
    radius_m: params.radiusMeters,
    provider: params.provider,
  });
  return request<ApiStop[]>(`/v1/stops/nearby${qs}`, {
    cacheKey: `nearby:${params.lat}:${params.lon}:${params.radiusMeters ?? ''}:${params.provider ?? ''}`,
    ttlMs: STATIC_TTL_MS,
  });
}

// ── Cache utilities (mostly for tests / sign-out) ──────────────────────────

export function clearApiCache(): void {
  cache.clear();
}

/**
 * Synchronously read a previously-fetched route from the in-memory cache.
 * Returns undefined if the route hasn't been requested via getRoute() yet
 * or its TTL has expired. Useful for render-time lookups where firing an
 * async fetch would cause a flicker.
 */
export function getCachedRoute(routeId: string): ApiRoute | undefined {
  return getCached<ApiRoute>(`route:${routeId}`);
}

/**
 * Fire-and-forget prefetch of route metadata. Safe to call repeatedly; the
 * result lands in the same cache that getCachedRoute reads from.
 */
export function prefetchRoute(routeId: string): void {
  if (getCached<ApiRoute>(`route:${routeId}`) !== undefined) return;
  const sep = routeId.indexOf(':');
  if (sep <= 0) return;
  const provider = routeId.slice(0, sep);
  const code = routeId.slice(sep + 1);
  notifyAfter(getRoute(provider, code));
}

export function getCachedStop(providerId: string, stopCode: string): ApiStop | undefined {
  return getCached<ApiStop>(`stop:${providerId}:${stopCode}`);
}

/**
 * Synchronously read a previously-fetched trip from the in-memory cache.
 */
export function getCachedTrip(tripId: string): ApiTrip | undefined {
  return getCached<ApiTrip>(`trip:${tripId}`);
}

/**
 * Fire-and-forget prefetch of trip metadata.
 */
export function prefetchTrip(tripId: string): void {
  if (getCached<ApiTrip>(`trip:${tripId}`) !== undefined) return;
  notifyAfter(getTrip(tripId));
}

export function prefetchStop(providerId: string, stopCode: string): void {
  if (getCached<ApiStop>(`stop:${providerId}:${stopCode}`) !== undefined) return;
  notifyAfter(getStop(providerId, stopCode));
}

export function getCachedAgency(providerId: string): ApiAgency | undefined {
  return getCached<ApiAgency>(`provider:${providerId}`);
}

export function prefetchAgency(providerId: string): void {
  if (getCached<ApiAgency>(`provider:${providerId}`) !== undefined) return;
  notifyAfter(getProvider(providerId));
}

// ── Cache change notifications ─────────────────────────────────────────────
//
// Components that read from the sync getters above can subscribe here to be
// notified when a new value lands. Internal — used by the useApiCacheVersion
// hook (hooks/useApiCache.ts).

const cacheListeners = new Set<() => void>();
let cacheVersion = 0;

export function subscribeApiCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export function getApiCacheVersion(): number {
  return cacheVersion;
}

function notifyAfter<T>(p: Promise<T>): void {
  p.then(() => {
    cacheVersion += 1;
    for (const l of cacheListeners) l();
  }).catch(() => {
    // leave un-cached so a later attempt can retry
  });
}
