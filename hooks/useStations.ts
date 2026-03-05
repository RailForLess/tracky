import { useEffect, useMemo, useState } from 'react';
import type { VisibleStation } from '../services/station-loader';
import { stationLoader } from '../services/station-loader';
import type { ViewportBounds } from '../types/train';
import { gtfsParser } from '../utils/gtfs-parser';
import { debug } from '../utils/logger';

export function useStations(bounds?: ViewportBounds) {
  const [gtfsLoaded, setGtfsLoaded] = useState(gtfsParser.isLoaded);
  const [initialized, setInitialized] = useState(false);

  // Poll for GTFS loaded state (max 30s)
  useEffect(() => {
    if (gtfsLoaded) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 60 × 500ms = 30s
    const interval = setInterval(() => {
      if (gtfsParser.isLoaded) {
        setGtfsLoaded(true);
        clearInterval(interval);
      } else if (++attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [gtfsLoaded]);

  // Initialize station loader once GTFS is loaded
  useEffect(() => {
    if (!gtfsLoaded || initialized) return;

    const stops = gtfsParser.getAllStops();
    stationLoader.initialize(stops);
    debug(`[useStations] Initialized station loader with ${stops.length} stops`);
    setInitialized(true);
  }, [gtfsLoaded, initialized]);

  // Get visible stations based on bounds
  const stations = useMemo<VisibleStation[]>(() => {
    if (!initialized) return [];

    if (bounds) {
      // Use padding for smoother panning
      return stationLoader.getVisibleStations(bounds);
    }

    // No bounds - return all stations (fallback)
    const stops = gtfsParser.getAllStops();
    return stops.map(s => ({
      id: s.stop_id,
      name: s.stop_name,
      lat: s.stop_lat,
      lon: s.stop_lon,
    }));
  }, [initialized, bounds?.minLat, bounds?.maxLat, bounds?.minLon, bounds?.maxLon]);

  return stations;
}
