import { useEffect, useMemo, useState } from 'react';
import { shapeLoader, type VisibleShape } from '../services/shape-loader';
import type { ViewportBounds } from '../types/train';
import { gtfsParser } from '../utils/gtfs-parser';
import { debug } from '../utils/logger';

export function useShapes(bounds?: ViewportBounds) {
  const [gtfsLoaded, setGtfsLoaded] = useState(gtfsParser.isLoaded);

  // Subscribe to GTFS loaded event — no polling
  useEffect(() => {
    if (gtfsLoaded) return;
    return gtfsParser.onLoaded(() => setGtfsLoaded(true));
  }, [gtfsLoaded]);

  // Compute visible shapes for the current bounds
  const visibleShapes = useMemo(() => {
    if (!gtfsLoaded) return [];
    let shapes: VisibleShape[];
    if (bounds) {
      shapes = shapeLoader.getVisibleShapes(bounds);
    } else {
      shapes = shapeLoader.getAllShapes();
    }
    debug(`[useShapes] ${shapes.length} shapes visible in viewport`);
    return shapes;
  }, [gtfsLoaded, bounds?.minLat, bounds?.maxLat, bounds?.minLon, bounds?.maxLon]);

  return { visibleShapes };
}
