import { useCallback, useEffect, useRef, useState } from 'react';
import { TrainStorageService } from '../services/storage';
import { gtfsParser } from '../utils/gtfs-parser';

interface TravelLine {
  key: string;
  from: { latitude: number; longitude: number };
  to: { latitude: number; longitude: number };
}

interface TravelStation {
  latitude: number;
  longitude: number;
  id: string;
}

/**
 * Manages travel overlay data for profile/settings views.
 * Loads trip history and resolves coordinates for travel lines/stations.
 */
export function useTravelOverlay(isOverlayMode: boolean) {
  const [travelLines, setTravelLines] = useState<TravelLine[]>([]);
  const [travelStations, setTravelStations] = useState<TravelStation[]>([]);
  const [profileYear, setProfileYear] = useState<number | null>(null);
  const tripHistoryRef = useRef<Awaited<ReturnType<typeof TrainStorageService.getTripHistory>>>([]);

  const resolveTravelOverlay = useCallback((history: typeof tripHistoryRef.current, year: number | null) => {
    const lines: TravelLine[] = [];
    const stationMap = new Map<string, { latitude: number; longitude: number }>();

    for (const trip of history) {
      if (year && new Date(trip.travelDate).getFullYear() !== year) continue;

      const fromStop = gtfsParser.getStop(trip.fromCode);
      const toStop = gtfsParser.getStop(trip.toCode);
      if (!fromStop || !toStop) continue;

      const fromCoord = { latitude: fromStop.stop_lat, longitude: fromStop.stop_lon };
      const toCoord = { latitude: toStop.stop_lat, longitude: toStop.stop_lon };

      lines.push({
        key: `${trip.tripId}-${trip.fromCode}-${trip.toCode}-${trip.travelDate}`,
        from: fromCoord,
        to: toCoord,
      });

      if (!stationMap.has(trip.fromCode)) stationMap.set(trip.fromCode, fromCoord);
      if (!stationMap.has(trip.toCode)) stationMap.set(trip.toCode, toCoord);
    }

    setTravelLines(lines);
    setTravelStations(Array.from(stationMap.entries()).map(([id, coord]) => ({ ...coord, id })));
  }, []);

  // Load trip history when overlay mode activates
  useEffect(() => {
    if (!isOverlayMode) {
      setTravelLines([]);
      setTravelStations([]);
      setProfileYear(null);
      tripHistoryRef.current = [];
      return;
    }

    (async () => {
      const history = await TrainStorageService.getTripHistory();
      tripHistoryRef.current = history;
      resolveTravelOverlay(history, profileYear);
    })();
  }, [isOverlayMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProfileYearChange = useCallback((year: number | null) => {
    setProfileYear(year);
    resolveTravelOverlay(tripHistoryRef.current, year);
  }, [resolveTravelOverlay]);

  return {
    travelLines,
    travelStations,
    profileYear,
    handleProfileYearChange,
  };
}
