import { useEffect, useMemo, useRef, useState } from 'react';
import { shapeLoader, type ViewportBounds, type VisibleShape } from '../services/shape-loader';
import { gtfsParser } from '../utils/gtfs-parser';
import { debug } from '../utils/logger';

const BATCH_SIZE = 8; // Shapes to add per frame
const BATCH_DELAY = 60; // ms between batches — gives the UI thread breathing room

export function useShapes(bounds?: ViewportBounds) {
  const [gtfsLoaded, setGtfsLoaded] = useState(gtfsParser.isLoaded);
  const [renderedShapes, setRenderedShapes] = useState<VisibleShape[]>([]);
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueueRef = useRef<VisibleShape[]>([]);
  const currentBoundsKeyRef = useRef<string>('');

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

  // Compute all shapes that SHOULD be visible for the current bounds
  const targetShapes = useMemo(() => {
    if (!gtfsLoaded) return [];
    let shapes: VisibleShape[];
    if (bounds) {
      shapes = shapeLoader.getVisibleShapes(bounds, 0.5);
    } else {
      shapes = shapeLoader.getAllShapes();
    }
    debug(`[useShapes] ${shapes.length} shapes visible in viewport`);
    return shapes;
  }, [gtfsLoaded, bounds?.minLat, bounds?.maxLat, bounds?.minLon, bounds?.maxLon]);

  // Progressive batching: when targetShapes changes, drip-feed them to the renderer
  useEffect(() => {
    // Cancel any in-progress batching
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    pendingQueueRef.current = [];

    const boundsKey = bounds
      ? `${bounds.minLat.toFixed(3)},${bounds.maxLat.toFixed(3)},${bounds.minLon.toFixed(3)},${bounds.maxLon.toFixed(3)}`
      : 'all';

    // Use ref for rendered IDs to avoid stale closure reads
    const renderedIds = renderedIdsRef.current;

    // Shapes to keep (already rendered and still in target)
    const keep = targetShapes.filter(s => renderedIds.has(s.id));

    // New shapes to add (in target but not yet rendered)
    const toAdd = targetShapes.filter(s => !renderedIds.has(s.id));

    // If we're zooming in (fewer shapes), just set immediately — removal is cheap
    if (toAdd.length === 0) {
      setRenderedShapes(keep);
      renderedIdsRef.current = new Set(keep.map(s => s.id));
      currentBoundsKeyRef.current = boundsKey;
      return;
    }

    // Start with what we can keep, then progressively add new shapes
    setRenderedShapes(keep);
    renderedIdsRef.current = new Set(keep.map(s => s.id));
    pendingQueueRef.current = [...toAdd];
    currentBoundsKeyRef.current = boundsKey;

    const drainBatch = () => {
      const queue = pendingQueueRef.current;
      if (queue.length === 0) return;

      const batch = queue.splice(0, BATCH_SIZE);
      for (const s of batch) renderedIdsRef.current.add(s.id);
      setRenderedShapes(prev => [...prev, ...batch]);

      if (queue.length > 0) {
        batchTimerRef.current = setTimeout(drainBatch, BATCH_DELAY);
      }
    };

    // Start first batch on next frame
    batchTimerRef.current = setTimeout(drainBatch, BATCH_DELAY);

    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, [targetShapes]);

  return { visibleShapes: renderedShapes };
}
