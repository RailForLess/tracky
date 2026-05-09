import { useState } from 'react';

export interface FrequentlyUsedItem {
  id: string;
  name: string;
  code: string;
  subtitle: string;
  type: 'train' | 'station';
}

const DEFAULTS: FrequentlyUsedItem[] = [
  { id: 'freq-train-acela', type: 'train', name: 'Acela', code: '2151', subtitle: 'Northeast Corridor' },
  { id: 'freq-train-ner', type: 'train', name: 'Northeast Regional', code: '171', subtitle: 'Northeast Corridor' },
  { id: 'freq-train-cz', type: 'train', name: 'California Zephyr', code: '5', subtitle: 'Chicago → Emeryville' },
  { id: 'freq-stop-nyp', type: 'station', name: 'New York Penn', code: 'NYP', subtitle: 'NYP' },
  { id: 'freq-stop-chi', type: 'station', name: 'Chicago Union', code: 'CHI', subtitle: 'CHI' },
];

/**
 * Frequently-used items shown in the empty search state. Backed by a static
 * default set for now — the previous bulk-load of all routes/stops is gone
 * with the GTFS parser; a real "popular" list will come from the backend.
 */
export function useFrequentlyUsed() {
  const [items] = useState<FrequentlyUsedItem[]>(DEFAULTS);
  return { items, refresh: () => Promise.resolve() };
}
