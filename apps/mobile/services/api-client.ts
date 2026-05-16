/**
 * Typed client for the Tracky backend REST API at `apiUrl` (config.ts).
 *
 * Path structure mirrors apps/api routes — see /v1/* in apps/api/routes/static.go
 * for endpoint definitions and apps/api/db/static_read.go for response shapes.
 *
 * All resources are addressed by typed global ids — see utils/ids.ts.
 *   stops:     s-amtrak-CHI
 *   routes:    r-amtrak-40751
 *   trips:     t-amtrak-251208
 *   hubs:      h-amtrak-CHI~UNION
 *   operators: o-amtrak
 *
 * Static lookups are cached in-memory for 1 hour (matches server Cache-Control).
 * Time-sensitive endpoints (departures, lookups, runs) skip the cache.
 */

import { config } from '../constants/config';
import { fetchWithTimeout } from '../utils/fetch-with-timeout';
import { encodeId } from '../utils/ids';
import { logger } from '../utils/logger';
import type {
  ApiAgency,
  ApiConnectionItem,
  ApiDepartureItem,
  ApiEnrichedStopTime,
  ApiHub,
  ApiRoute,
  ApiSearchHitType,
  ApiSearchResult,
  ApiServiceInfo,
  ApiStop,
  ApiStopOrHub,
  ApiTrainItem,
  ApiTrainPosition,
  ApiTrainStopTime,
  ApiTrip,
  RealtimeUpdate,
} from '../types/api';

const STATIC_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 12_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();
const inFlightPrefetches = new Set<string>();

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
  const shouldLogLookup = path.startsWith('/v1/trips');
  if (shouldLogLookup) {
    logger.warn('[api-client] HTTP lookup request', { path, url });
  }
  const res = await fetchWithTimeout(url, { timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body was not JSON; keep status-only message
    }
    if (shouldLogLookup) {
      logger.warn('[api-client] HTTP lookup failed', { path, status: res.status, message });
    }
    if (res.status === 429) {
      logger.warn('[api-client] HTTP rate limited', { path, status: res.status, message, url });
    }
    throw new ApiError(res.status, path, message);
  }

  const value = (await res.json()) as T;
  if (shouldLogLookup) {
    logger.warn('[api-client] HTTP lookup ok', {
      path,
      status: res.status,
      resultType: Array.isArray(value) ? 'array' : typeof value,
      count: Array.isArray(value) ? value.length : undefined,
    });
  }
  if (opts.cacheKey && opts.ttlMs) {
    setCached(opts.cacheKey, value, opts.ttlMs);
  }
  return value;
}

// ── Providers ──────────────────────────────────────────────────────────────

/**
 * Look up an operator. `operatorId` may be a typed global id ('o-amtrak') or
 * a bare provider name ('amtrak') — the latter is encoded for you.
 */
export function getProvider(operatorId: string): Promise<ApiAgency> {
  const id = operatorId.startsWith('o-') ? operatorId : encodeId('o', operatorId, '');
  return request<ApiAgency>(`/v1/providers/${encodeURIComponent(id)}`, {
    cacheKey: `provider:${id}`,
    ttlMs: STATIC_TTL_MS,
  });
}

// ── Stops ──────────────────────────────────────────────────────────────────

/**
 * Polymorphic stop fetch. Returns ApiStop for s- ids and ApiHub for h- ids.
 * Narrow on the `type` discriminator to access kind-specific fields.
 */
export function getStop(stopOrHubId: string): Promise<ApiStopOrHub> {
  return request<ApiStopOrHub>(`/v1/stops/${encodeURIComponent(stopOrHubId)}`, {
    cacheKey: `stop:${stopOrHubId}`,
    ttlMs: STATIC_TTL_MS,
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function getRoute(routeId: string): Promise<ApiRoute> {
  return request<ApiRoute>(`/v1/routes/${encodeURIComponent(routeId)}`, {
    cacheKey: `route:${routeId}`,
    ttlMs: STATIC_TTL_MS,
  });
}

export function getRoutes(operatorId: string): Promise<ApiRoute[]> {
  const id = operatorId.startsWith('o-') ? operatorId : encodeId('o', operatorId, '');
  const qs = buildQuery({ provider_id: id });
  return request<ApiRoute[]>(`/v1/routes${qs}`, {
    cacheKey: `routes:${id}`,
    ttlMs: STATIC_TTL_MS,
  });
}

export function getTripsForRoute(routeId: string): Promise<ApiTrainItem[]> {
  return request<ApiTrainItem[]>(
    `/v1/routes/${encodeURIComponent(routeId)}/trips`,
    { cacheKey: `routeTrips:${routeId}`, ttlMs: STATIC_TTL_MS },
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

/**
 * Look up scheduled trips by train number on a service date.
 * Uses GET /v1/trips?train_number=&date= (formerly /v1/trips/lookup).
 */
export function lookupTrips(params: {
  /** Bare provider ('amtrak') or operator id ('o-amtrak'). */
  provider: string;
  trainNumber: string;
  date: string;
}): Promise<ApiTrip[]> {
  const providerId = params.provider.startsWith('o-')
    ? params.provider
    : encodeId('o', params.provider, '');
  const qs = buildQuery({
    provider_id: providerId,
    train_number: params.trainNumber,
    date: params.date,
  });
  return request<ApiTrip[]>(`/v1/trips${qs}`);
}

// ── Departures & connections ───────────────────────────────────────────────

/** Departures at a stop on a date. Nested under the stop per the new spec. */
export function getDepartures(params: {
  stopId: string;
  date: string;
}): Promise<ApiDepartureItem[]> {
  const qs = buildQuery({ date: params.date });
  return request<ApiDepartureItem[]>(
    `/v1/stops/${encodeURIComponent(params.stopId)}/departures${qs}`,
  );
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
  const providerId = params.provider.startsWith('o-')
    ? params.provider
    : encodeId('o', params.provider, '');
  const qs = buildQuery({
    provider_id: providerId,
    train_number: trainNumber,
    from: params.from,
    to: params.to,
  });
  return request<ApiServiceInfo>(`/v1/trips/service${qs}`);
}

// ── Search ─────────────────────────────────────────────────────────────────

export function search(params: {
  q: string;
  /** Bare provider ('amtrak') or operator id ('o-amtrak'). Empty = all. */
  provider?: string;
  types?: ApiSearchHitType[];
}): Promise<ApiSearchResult> {
  const providerId = params.provider
    ? params.provider.startsWith('o-')
      ? params.provider
      : encodeId('o', params.provider, '')
    : undefined;
  const qs = buildQuery({
    q: params.q,
    provider_id: providerId,
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
  tripId: string;
  runDate: string;
}): Promise<ApiTrainStopTime[]> {
  return request<ApiTrainStopTime[]>(
    `/v1/trips/${encodeURIComponent(params.tripId)}/runs/${encodeURIComponent(params.runDate)}/stops`,
  );
}

/**
 * Latest realtime snapshot for a topic. Returns the same envelope shape that
 * the WS publishes — HTTP catch-up and WS streaming deliver byte-identical
 * payloads. The topic mirrors what the WS endpoint accepts: today only
 * operator topics ('o-amtrak') are fanned out, but route/trip topics will
 * resolve here when they land.
 */
export function getRealtime(topic: string): Promise<RealtimeUpdate> {
  const qs = buildQuery({ topic });
  return request<RealtimeUpdate>(`/v1/realtime${qs}`);
}

/** Convenience: latest positions for a topic, unwrapped from the envelope. */
export function getRealtimePositions(topic: string): Promise<ApiTrainPosition[]> {
  return getRealtime(topic).then(u => u.positions);
}

/**
 * Stops near a location across all providers, for "nearest station" suggestions.
 * Backed by GET /v1/stops?lat=&lon=&radius_m=.
 */
export function getNearbyStops(params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  /** Bare provider ('amtrak') or operator id ('o-amtrak'). Empty = all. */
  provider?: string;
}): Promise<ApiStop[]> {
  const providerId = params.provider
    ? params.provider.startsWith('o-')
      ? params.provider
      : encodeId('o', params.provider, '')
    : undefined;
  const qs = buildQuery({
    lat: params.lat,
    lon: params.lon,
    radius_m: params.radiusMeters,
    provider_id: providerId,
  });
  return request<ApiStop[]>(`/v1/stops${qs}`, {
    cacheKey: `nearby:${params.lat}:${params.lon}:${params.radiusMeters ?? ''}:${providerId ?? ''}`,
    ttlMs: STATIC_TTL_MS,
  });
}

// ── Cache utilities (mostly for tests / sign-out) ──────────────────────────

export function clearApiCache(): void {
  cache.clear();
}

/**
 * Synchronously read a previously-fetched route from the in-memory cache.
 */
export function getCachedRoute(routeId: string): ApiRoute | undefined {
  return getCached<ApiRoute>(`route:${routeId}`);
}

/** Fire-and-forget prefetch of route metadata. */
export function prefetchRoute(routeId: string): void {
  prefetchOnce(`route:${routeId}`, () => getRoute(routeId));
}

export function getCachedStop(stopId: string): ApiStopOrHub | undefined {
  return getCached<ApiStopOrHub>(`stop:${stopId}`);
}

export function getCachedTrip(tripId: string): ApiTrip | undefined {
  return getCached<ApiTrip>(`trip:${tripId}`);
}

export function prefetchTrip(tripId: string): void {
  prefetchOnce(`trip:${tripId}`, () => getTrip(tripId));
}

export function prefetchStop(stopId: string): void {
  prefetchOnce(`stop:${stopId}`, () => getStop(stopId));
}

export function getCachedAgency(operatorId: string): ApiAgency | undefined {
  const id = operatorId.startsWith('o-') ? operatorId : encodeId('o', operatorId, '');
  return getCached<ApiAgency>(`provider:${id}`);
}

export function prefetchAgency(operatorId: string): void {
  const id = operatorId.startsWith('o-') ? operatorId : encodeId('o', operatorId, '');
  prefetchOnce(`provider:${id}`, () => getProvider(id));
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

function prefetchOnce<T>(cacheKey: string, load: () => Promise<T>): void {
  if (getCached<T>(cacheKey) !== undefined || inFlightPrefetches.has(cacheKey)) return;
  inFlightPrefetches.add(cacheKey);
  notifyAfter(
    load().finally(() => {
      inFlightPrefetches.delete(cacheKey);
    }),
  );
}
