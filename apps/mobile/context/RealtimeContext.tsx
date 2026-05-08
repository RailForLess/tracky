import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { PROVIDERS } from '../constants/providers';
import { wsClient } from '../services/ws-client';
import type { ApiTrainPosition, RealtimeUpdate } from '../types/api';

type PositionsByProvider = Record<string, ApiTrainPosition[]>;

interface RealtimeContextValue {
  positionsByProvider: PositionsByProvider;
}

const EMPTY_POSITIONS: PositionsByProvider = {};

const RealtimeContext = createContext<RealtimeContextValue>({
  positionsByProvider: EMPTY_POSITIONS,
});

interface RealtimeProviderProps {
  /** Defaults to all six known providers. */
  providers?: readonly string[];
  children: React.ReactNode;
}

/**
 * Subscribes to the realtime WebSocket and exposes the latest positions
 * per provider via context. Updates are coalesced into a single state
 * update per WS message.
 */
export function RealtimeProvider({ providers, children }: RealtimeProviderProps) {
  const providerIds = useMemo(
    () => providers ?? PROVIDERS.map(p => p.id),
    [providers],
  );

  const [positionsByProvider, setPositionsByProvider] =
    useState<PositionsByProvider>(EMPTY_POSITIONS);

  // Hold the most recent positions in a ref so we can produce a stable
  // updater function below.
  const latestRef = useRef<PositionsByProvider>(EMPTY_POSITIONS);

  useEffect(() => {
    const ids = [...providerIds];
    const onUpdate = (msg: RealtimeUpdate) => {
      const next: PositionsByProvider = {
        ...latestRef.current,
        [msg.provider]: msg.positions,
      };
      latestRef.current = next;
      setPositionsByProvider(next);
    };
    const unsubscribe = wsClient.subscribe(ids, onUpdate);
    return unsubscribe;
  }, [providerIds]);

  const value = useMemo(
    () => ({ positionsByProvider }),
    [positionsByProvider],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/**
 * All known live train positions, optionally filtered to a single provider.
 * Returns a stable empty array when no data has arrived yet for the
 * requested provider.
 */
export function useRealtimePositions(provider?: string): ApiTrainPosition[] {
  const { positionsByProvider } = useContext(RealtimeContext);
  return useMemo(() => {
    if (provider) return positionsByProvider[provider] ?? [];
    const all: ApiTrainPosition[] = [];
    for (const list of Object.values(positionsByProvider)) {
      for (const p of list) all.push(p);
    }
    return all;
  }, [positionsByProvider, provider]);
}
