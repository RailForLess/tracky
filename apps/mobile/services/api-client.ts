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
  ApiTrainPosition,
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

// ── Pending backend additions ──────────────────────────────────────────────
//
// The endpoints below aren't on the build-backend branch yet. They're stubbed
// here so call sites can be written; flip them on once the backend lands.

/**
 * Per-stop scheduled + estimated + actual times for a specific run of a trip.
 * Required for TrainDetailModal's per-stop delay display.
 *
 * Expected: GET /v1/runs/{provider}/{tripId}/{runDate}/stops
 */
export function getRunStops(_params: {
  provider: string;
  tripId: string;
  runDate: string;
}): Promise<ApiTrainStopTime[]> {
  return Promise.reject(
    new Error('getRunStops: backend endpoint not yet implemented'),
  );
}

/**
 * Stops near a location across all providers, for "nearest station" suggestions.
 *
 * Expected: GET /v1/stops/nearby?lat=&lon=&radius_m=
 */
export function getNearbyStops(_params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
}): Promise<ApiStop[]> {
  return Promise.reject(
    new Error('getNearbyStops: backend endpoint not yet implemented'),
  );
}

/**
 * Current TrainPosition for a specific run, for hydrating saved trains
 * without subscribing to the full WS feed. (Optional — workaround is to
 * subscribe + filter.)
 *
 * Expected: GET /v1/runs/{provider}/{tripId}/{runDate}
 */
export function getRunPosition(_params: {
  provider: string;
  tripId: string;
  runDate: string;
}): Promise<ApiTrainPosition> {
  return Promise.reject(
    new Error('getRunPosition: backend endpoint not yet implemented'),
  );
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
  // Swallow errors — prefetching is best-effort.
  getRoute(provider, code).catch(() => {
    /* leave it un-cached so a later attempt can retry */
  });
}
