/**
 * Vestigial GTFS-refresh context.
 *
 * Originally drove the local GTFS download/cache lifecycle on app start.
 * The app now uses the Go API for static data, so there's nothing to
 * refresh — but several callers (RefreshBubble, SettingsModal, MapScreen,
 * ModalContent) still depend on the hook's shape. This stub keeps that
 * shape stable while the call sites are cleaned up in a follow-up.
 *
 * Behaviors retained:
 *  - LocationSuggestionsService.initialize runs once on mount (it is
 *    independent of GTFS and the suggestions UI relies on it).
 *  - Native splash is hidden immediately on mount (no cache to load).
 */

import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { LocationSuggestionsService } from '../services/location-suggestions';
import { logger } from '../utils/logger';

interface GTFSRefreshContextType {
  isRefreshing: boolean;
  isLoadingCache: boolean;
  isStreamingData: boolean;
  refreshProgress: number;
  refreshStep: string;
  refreshFailed: boolean;
  triggerRefresh: () => void;
  dismissRefreshFailure: () => void;
  debugShowLoadingScreen: () => void;
}

const NOOP_VALUE: GTFSRefreshContextType = {
  isRefreshing: false,
  isLoadingCache: false,
  isStreamingData: false,
  refreshProgress: 0,
  refreshStep: '',
  refreshFailed: false,
  triggerRefresh: () => {},
  dismissRefreshFailure: () => {},
  debugShowLoadingScreen: () => {},
};

const GTFSRefreshContext = createContext<GTFSRefreshContextType | undefined>(undefined);

export const useGTFSRefresh = () => {
  const ctx = useContext(GTFSRefreshContext);
  if (!ctx) throw new Error('useGTFSRefresh must be used within GTFSRefreshProvider');
  return ctx;
};

export const GTFSRefreshProvider: React.FC<{ children: React.ReactNode; onRefreshComplete?: () => void }> = ({
  children,
  onRefreshComplete,
}) => {
  useEffect(() => {
    SplashScreen.hideAsync();
    LocationSuggestionsService.initialize().catch(e =>
      logger.warn('LocationSuggestionsService.initialize failed', e),
    );
    onRefreshComplete?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => NOOP_VALUE, []);

  return (
    <GTFSRefreshContext.Provider value={value}>
      {children}
    </GTFSRefreshContext.Provider>
  );
};
