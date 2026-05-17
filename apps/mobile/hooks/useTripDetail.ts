/**
 * Loads everything TrainDetailModal needs about a trip: scheduled stop
 * times, per-stop coordinates/timezone, and (when available) live
 * estimated/actual times per stop.
 *
 * Replaces several gtfsParser/RealtimeService calls with one async hook.
 * Stop coordinates fan out as parallel /v1/stops/{stopId} requests;
 * the 1h cache makes repeat opens of the same trip cheap.
 *
 * Per-stop ETAs come from /v1/trips/{tripId}/runs/{runDate}/stops
 * which is currently a stub on apps/api — the hook returns scheduled-only
 * times until the backend lands real data for it.
 */

import { useEffect, useState } from 'react';
import { ApiError, getRunStops, getStop, getTripStops } from '../services/api-client';
import type { ApiTrainStopTime } from '../types/api';
import { encodeId, tryParseId } from '../utils/ids';
import { logger } from '../utils/logger';

export interface TripDetailStop {
  /** Namespaced provider:code, e.g. "amtrak:NYP". */
  stopId: string;
  /** Raw GTFS stop_code, e.g. "NYP". */
  code: string;
  name: string;
  sequence: number;
  /** GTFS-format scheduled times (HH:MM:SS, may be > 24:00 for overnight). */
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  /** Coordinates and timezone — populated by the per-stop fetch. */
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  /** Live data — only set when /v1/runs/.../stops returns rows for the run. */
  estimatedArrival: Date | null;
  estimatedDeparture: Date | null;
  actualArrival: Date | null;
  actualDeparture: Date | null;
  /** Minutes late (positive) or early (negative); null if not computable. */
  arrivalDelayMin: number | null;
  departureDelayMin: number | null;
}

export interface TripDetail {
  stops: TripDetailStop[];
  loading: boolean;
  /** True iff the per-stop ETA endpoint is unavailable for this run. */
  delaysUnavailable: boolean;
}

const EMPTY: TripDetail = { stops: [], loading: false, delaysUnavailable: true };

function parseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function useTripDetail(
  tripId: string | null | undefined,
  runDate?: Date,
): TripDetail {
  const [state, setState] = useState<TripDetail>(EMPTY);

  useEffect(() => {
    if (!tripId) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true }));

    (async () => {
      const provider = tryParseId(tripId)?.provider ?? 'amtrak';

      // Phase 1: scheduled stop times — single endpoint.
      let scheduled: TripDetailStop[];
      try {
        const apiStops = await getTripStops(tripId);
        scheduled = apiStops.map(et => ({
          stopId: encodeId('s', provider, et.stopCode),
          code: et.stopCode,
          name: et.stopName,
          sequence: et.stopSequence,
          scheduledArrival: et.arrivalTime,
          scheduledDeparture: et.departureTime,
          lat: null,
          lon: null,
          timezone: null,
          estimatedArrival: null,
          estimatedDeparture: null,
          actualArrival: null,
          actualDeparture: null,
          arrivalDelayMin: null,
          departureDelayMin: null,
        }));
      } catch (err) {
        logger.warn('[useTripDetail] /v1/trips/.../stops failed', err);
        if (!cancelled) setState({ stops: [], loading: false, delaysUnavailable: true });
        return;
      }
      if (cancelled) return;

      // Surface scheduled times immediately so the timeline can render.
      setState({ stops: scheduled, loading: true, delaysUnavailable: true });

      // Phase 2: per-stop coordinates / tz, fanned out in parallel.
      const enrichedPromise = Promise.all(
        scheduled.map(async (stop) => {
          try {
            const apiStop = await getStop(stop.stopId);
            if (apiStop.type !== 'stop') return stop;
            return {
              ...stop,
              lat: apiStop.lat,
              lon: apiStop.lon,
              timezone: apiStop.timezone ?? null,
            };
          } catch {
            return stop;
          }
        }),
      );

      // Phase 3: per-stop estimated/actual times (optional — stub today).
      const date = runDate ?? new Date();
      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const delaysPromise = (async (): Promise<{ rows: ApiTrainStopTime[]; available: boolean }> => {
        try {
          const rows = await getRunStops({ tripId, runDate: ymd });
          return { rows, available: true };
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) {
            logger.debug('[useTripDetail] run stops unavailable', err);
          }
          return { rows: [], available: false };
        }
      })();

      const [enriched, delays] = await Promise.all([enrichedPromise, delaysPromise]);
      if (cancelled) return;

      const byCode = new Map<string, ApiTrainStopTime>();
      for (const r of delays.rows) byCode.set(r.stopCode, r);

      const merged: TripDetailStop[] = enriched.map(stop => {
        const live = byCode.get(stop.code);
        if (!live) return stop;
        const scheduledArr = parseIso(live.scheduledArr);
        const scheduledDep = parseIso(live.scheduledDep);
        const estimatedArr = parseIso(live.estimatedArr);
        const estimatedDep = parseIso(live.estimatedDep);
        const actualArr = parseIso(live.actualArr);
        const actualDep = parseIso(live.actualDep);
        const refArr = actualArr ?? estimatedArr;
        const refDep = actualDep ?? estimatedDep;
        return {
          ...stop,
          estimatedArrival: estimatedArr,
          estimatedDeparture: estimatedDep,
          actualArrival: actualArr,
          actualDeparture: actualDep,
          arrivalDelayMin:
            scheduledArr && refArr
              ? Math.round((refArr.getTime() - scheduledArr.getTime()) / 60_000)
              : null,
          departureDelayMin:
            scheduledDep && refDep
              ? Math.round((refDep.getTime() - scheduledDep.getTime()) / 60_000)
              : null,
        };
      });

      setState({ stops: merged, loading: false, delaysUnavailable: !delays.available });
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, runDate?.getTime()]);

  return state;
}
