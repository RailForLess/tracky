import { useEffect, useRef, useState } from 'react';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_DELAY = 50; // ms between batches

interface Identifiable {
  id: string;
}

/**
 * Progressive batching hook — drip-feeds new items into the render list
 * so markers/overlays lazy-load in like routes do via useShapes.
 *
 * Items already on screen are updated immediately (fresh data from target),
 * while genuinely new items are queued and added in small batches.
 */
export function useBatchedItems<T extends Identifiable>(
  targetItems: T[],
  batchSize = DEFAULT_BATCH_SIZE,
  batchDelay = DEFAULT_BATCH_DELAY,
): T[] {
  const [rendered, setRendered] = useState<T[]>([]);
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueueRef = useRef<T[]>([]);

  useEffect(() => {
    // Cancel any in-progress batching
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    pendingQueueRef.current = [];

    // Use ref for rendered IDs to avoid stale closure reads
    const renderedIds = renderedIdsRef.current;

    // Single pass: partition into keep (already rendered) and toAdd (new)
    const keep: T[] = [];
    const toAdd: T[] = [];
    for (const item of targetItems) {
      if (renderedIds.has(item.id)) {
        keep.push(item);
      } else {
        toAdd.push(item);
      }
    }

    // Zooming in / fewer items — set immediately, removal is cheap
    if (toAdd.length === 0) {
      setRendered(keep);
      renderedIdsRef.current = new Set(keep.map(item => item.id));
      return;
    }

    // Start with kept items, then progressively batch in new ones
    setRendered(keep);
    renderedIdsRef.current = new Set(keep.map(item => item.id));
    pendingQueueRef.current = [...toAdd];

    const drainBatch = () => {
      const queue = pendingQueueRef.current;
      if (queue.length === 0) return;

      const batch = queue.splice(0, batchSize);
      for (const item of batch) renderedIdsRef.current.add(item.id);
      setRendered(prev => [...prev, ...batch]);

      if (queue.length > 0) {
        batchTimerRef.current = setTimeout(drainBatch, batchDelay);
      }
    };

    // Start first batch on next frame
    batchTimerRef.current = setTimeout(drainBatch, batchDelay);

    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, [targetItems, batchSize, batchDelay]);

  return rendered;
}
