import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ensureFreshGTFS, isCacheStale, loadCachedGTFS, loadDeferredShapes } from '../services/gtfs-sync';
import { LocationSuggestionsService } from '../services/location-suggestions';
import { gtfsParser } from '../utils/gtfs-parser';
import { logger } from '../utils/logger';

interface GTFSRefreshState {
  isRefreshing: boolean;
  isLoadingCache: boolean;
  refreshProgress: number;
  refreshStep: string;
  refreshFailed: boolean;
}

interface GTFSRefreshContextType extends GTFSRefreshState {
  /** Manual refresh triggered from settings */
  triggerRefresh: () => void;
  /** Dismiss the persistent failure indicator */
  dismissRefreshFailure: () => void;
  /** Debug: show loading screen for 5 seconds */
  debugShowLoadingScreen: () => void;
}

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshStep, setRefreshStep] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const hasInitialized = useRef(false);
  const onRefreshCompleteRef = useRef(onRefreshComplete);
  onRefreshCompleteRef.current = onRefreshComplete;

  const runRefresh = useCallback(async (force: boolean) => {
    logger.info(`[GTFS] Starting refresh (force=${force})`);
    setIsRefreshing(true);
    setRefreshProgress(0.05);
    setRefreshStep(force ? 'Forcing refresh' : 'Checking schedule');
    try {
      if (force) {
        await AsyncStorage.removeItem('GTFS_LAST_FETCH');
      }
      const result = await ensureFreshGTFS(update => {
        setRefreshProgress(update.progress);
        setRefreshStep(update.step + (update.detail ? ` · ${update.detail}` : ''));
      });
      if (result.usedCache && !force) {
        // Cache was still valid — no download needed
      }
      setRefreshProgress(1);
      setRefreshStep('Refresh complete');
      setRefreshFailed(false);
      logger.info(`[GTFS] Refresh complete (usedCache=${result.usedCache})`);
      LocationSuggestionsService.initialize(gtfsParser).catch(e => logger.warn('LocationSuggestionsService.initialize failed', e));
      onRefreshCompleteRef.current?.();
      // Brief display of completion then clear
      setTimeout(() => {
        setIsRefreshing(false);
        setRefreshProgress(0);
        setRefreshStep('');
      }, 1200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`GTFS refresh failed: ${msg}`, error);
      setRefreshStep(`Schedule update failed: ${msg}`);
      setRefreshFailed(true);
      setTimeout(() => {
        setIsRefreshing(false);
        setRefreshProgress(0);
      }, 2000);
    }
  }, []);

  // Auto-initialize GTFS on provider mount (runs once)
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialize = async () => {
      setIsLoadingCache(true);
      setRefreshStep('Loading cached data...');
      setRefreshProgress(0.1);

      // Hide native splash immediately — the app's own LoadingOverlay handles the visual loading state
      SplashScreen.hideAsync();

      try {
        const loaded = await loadCachedGTFS();
        if (loaded) {
          // Cache loaded — app is usable now
          setIsLoadingCache(false);
          setRefreshProgress(0);
          setRefreshStep('');

          // Load shapes in background after splash is hidden
          loadDeferredShapes();

          // Pre-compute location-based suggestions in background
          LocationSuggestionsService.initialize(gtfsParser).catch(e => logger.warn('LocationSuggestionsService.initialize failed', e));

          // Check staleness in background
          const stale = await isCacheStale();
          if (stale) {
            runRefresh(false);
          }
        } else {
          // No cache at all — show refresh progress UI
          setIsLoadingCache(false);
          runRefresh(false);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`GTFS initialization failed: ${msg}`, error);
        setIsLoadingCache(false);
        setRefreshStep('');
        Alert.alert(
          'Schedule Data Needs Refresh',
          'Cached schedule data could not be loaded. A fresh download is required.',
          [{ text: 'Refresh Now', onPress: () => runRefresh(true) }]
        );
      }
    };

    initialize();
  }, [runRefresh]);

  const triggerRefresh = useCallback(() => {
    if (isRefreshing) return;
    setRefreshFailed(false);
    runRefresh(false);
  }, [isRefreshing, runRefresh]);

  const dismissRefreshFailure = useCallback(() => {
    setRefreshFailed(false);
    setRefreshStep('');
  }, []);

  const debugShowLoadingScreen = useCallback(() => {
    setIsLoadingCache(true);
    setTimeout(() => setIsLoadingCache(false), 5000);
  }, []);

  const value = useMemo(
    () => ({
      isRefreshing,
      isLoadingCache,
      refreshProgress,
      refreshStep,
      refreshFailed,
      triggerRefresh,
      dismissRefreshFailure,
      debugShowLoadingScreen,
    }),
    [isRefreshing, isLoadingCache, refreshProgress, refreshStep, refreshFailed, triggerRefresh, dismissRefreshFailure, debugShowLoadingScreen]
  );

  return (
    <GTFSRefreshContext.Provider value={value}>
      {children}
    </GTFSRefreshContext.Provider>
  );
};
