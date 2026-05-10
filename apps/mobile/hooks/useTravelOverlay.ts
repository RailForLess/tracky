import { useCallback, useEffect, useRef, useState } from 'react';
import { getStop } from '../services/api-client';
import { TrainStorageService } from '../services/storage';

const DEFAULT_PROVIDER = 'amtrak';

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

function splitNamespaced(stopId: string): { provider: string; code: string } {
  const i = stopId.indexOf(':');
  if (i <= 0) return { provider: DEFAULT_PROVIDER, code: stopId };
  return { provider: stopId.slice(0, i), code: stopId.slice(i + 1) };
}

async function resolveCoord(stopId: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { provider, code } = splitNamespaced(stopId);
    const s = await getStop(provider, code);
    return { latitude: s.lat, longitude: s.lon };
  } catch {
    return null;
  }
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
  const resolveTokenRef = useRef(0);

  const resolveTravelOverlay = useCallback(async (
    history: typeof tripHistoryRef.current,
    year: number | null,
  ) => {
    const token = ++resolveTokenRef.current;
    const filtered = year ? history.filter(t => new Date(t.travelDate).getFullYear() === year) : history;

    const codes = new Set<string>();
    for (const trip of filtered) {
      codes.add(trip.fromCode);
      codes.add(trip.toCode);
    }
    const codeList = [...codes];
    const coords = await Promise.all(codeList.map(resolveCoord));
    if (token !== resolveTokenRef.current) return;
    const coordByCode = new Map<string, { latitude: number; longitude: number }>();
    for (let i = 0; i < codeList.length; i++) {
      const c = coords[i];
      if (c) coordByCode.set(codeList[i], c);
    }

    const lines: TravelLine[] = [];
    const stationMap = new Map<string, { latitude: number; longitude: number }>();
    for (const trip of filtered) {
      const fromCoord = coordByCode.get(trip.fromCode);
      const toCoord = coordByCode.get(trip.toCode);
      if (!fromCoord || !toCoord) continue;

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
      resolveTokenRef.current++;
      setTravelLines([]);
      setTravelStations([]);
      setProfileYear(null);
      tripHistoryRef.current = [];
      return;
    }

    (async () => {
      const history = await TrainStorageService.getTripHistory();
      tripHistoryRef.current = history;
      await resolveTravelOverlay(history, profileYear);
    })();
  }, [isOverlayMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProfileYearChange = useCallback((year: number | null) => {
    setProfileYear(year);
    void resolveTravelOverlay(tripHistoryRef.current, year);
  }, [resolveTravelOverlay]);

  return {
    travelLines,
    travelStations,
    profileYear,
    handleProfileYearChange,
  };
}
