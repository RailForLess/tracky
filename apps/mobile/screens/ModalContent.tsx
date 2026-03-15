import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SwipeableTrainCard } from '../components/TrainList';
import { PlaceholderBlurb } from '../components/PlaceholderBlurb';
import { TwoStationSearch } from '../components/TwoStationSearch';
import { SlideUpModalContext } from '../components/ui/SlideUpModal';
import { useGTFSRefresh } from '../context/GTFSRefreshContext';
import { useModalState } from '../context/ModalContext';
import { useTrainContext } from '../context/TrainContext';
import { useFrequentlyUsed } from '../hooks/useFrequentlyUsed';
import { useAutoArchive } from '../hooks/useAutoArchive';
import { TrainStorageService } from '../services/storage';
import { TrainActivityManager } from '../services/train-activity-manager';
import type { SavedTrainRef, Train } from '../types/train';
import { useColors } from '../context/ThemeContext';
import { createStyles } from './styles';
import { light as hapticLight } from '../utils/haptics';
import { parseTimeToDate } from '../utils/time-formatting';
import { logger } from '../utils/logger';

export interface ModalContentHandle {
  triggerRefresh: () => void;
}

export const ModalContent = React.forwardRef<
  ModalContentHandle,
  { onTrainSelect?: (train: Train) => void; onOpenProfile?: () => void }
>(function ModalContent({ onTrainSelect, onOpenProfile }, ref) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: windowHeight } = useWindowDimensions();
  const { isFullscreen, isCollapsed, scrollOffset, contentOpacity, panRef, snapToPoint } =
    useContext(SlideUpModalContext);

  const fadeAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: contentOpacity.value,
    };
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const { savedTrains, setSavedTrains, setSelectedTrain } = useTrainContext();
  const { refresh: refreshFrequentlyUsed } = useFrequentlyUsed();
  const { isLoadingCache, triggerRefresh } = useGTFSRefresh();
  const { activeModal } = useModalState();

  // Refs to avoid stale closures in useEffect
  const refreshFrequentlyUsedRef = useRef(refreshFrequentlyUsed);
  refreshFrequentlyUsedRef.current = refreshFrequentlyUsed;

  // Only block UI for initial cache load (no cache at all)
  const isLoading = isLoadingCache;

  // Auto-archive past trips and sync calendar trips (extracted to hook)
  useAutoArchive(isLoadingCache, setSavedTrains);

  // Ref for imperatively scrolling the train list to top
  const flatListRef = useRef<FlatList<Train>>(null);

  // Refresh saved trains when main modal becomes active (returning from profile, etc.)
  const isMainActive = activeModal === 'main';
  useEffect(() => {
    if (!isMainActive || isLoadingCache) return;
    TrainStorageService.getSavedTrains().then(freshTrains => {
      setSavedTrains(prev => {
        const realtimeByKey = new Map<string, Train['realtime']>();
        for (const t of prev) {
          const key = `${t.tripId}|${t.fromCode}|${t.toCode}`;
          if (t.realtime) realtimeByKey.set(key, t.realtime);
        }
        return freshTrains.map(t => {
          const key = `${t.tripId}|${t.fromCode}|${t.toCode}`;
          const existing = realtimeByKey.get(key);
          return existing ? { ...t, realtime: existing } : t;
        });
      });
    });
    // Always scroll to top when navigating back to My Trains
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [isMainActive, setSavedTrains]);

  // Refresh frequently used items once GTFS cache is ready
  const hasRefreshedFreqUsed = useRef(false);
  useEffect(() => {
    if (!isLoadingCache && !hasRefreshedFreqUsed.current) {
      hasRefreshedFreqUsed.current = true;
      refreshFrequentlyUsedRef.current();
    }
  }, [isLoadingCache]);

  // Save train with segmentation support
  const saveTrainWithSegment = async (tripId: string, fromCode: string, toCode: string, travelDate: Date) => {
    const ref: SavedTrainRef = {
      tripId,
      fromCode,
      toCode,
      travelDate: travelDate.getTime(),
      savedAt: Date.now(),
    };
    const saved = await TrainStorageService.saveTrainRef(ref);
    if (saved) {
      const updatedTrains = await TrainStorageService.getSavedTrains();
      setSavedTrains(updatedTrains);
      const savedTrain = updatedTrains.find(t => t.tripId === tripId && t.fromCode === fromCode && t.toCode === toCode);
      if (savedTrain) {
        TrainActivityManager.onTrainSaved(savedTrain).catch(e => logger.warn('TrainActivityManager.onTrainSaved failed', e));
      }
    }
    return saved;
  };

  // Expose refresh to parent via ref
  React.useImperativeHandle(
    ref,
    () => ({
      triggerRefresh,
    }),
    [triggerRefresh]
  );

  // Sort saved trains by departure time (earliest first)
  const sortedTrains = useMemo(() => {
    const now = new Date();
    return [...savedTrains].sort((a, b) => {
      // First compare by travel date if available
      if (a.travelDate && b.travelDate) {
        const dateA = new Date(a.travelDate);
        const dateB = new Date(b.travelDate);
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA.getTime() - dateB.getTime();
        }
      } else if (a.daysAway !== undefined && b.daysAway !== undefined) {
        if (a.daysAway !== b.daysAway) {
          return a.daysAway - b.daysAway;
        }
      }
      // If same day, compare by departure time
      const departA = parseTimeToDate(a.departTime, now);
      const departB = parseTimeToDate(b.departTime, now);
      return departA.getTime() - departB.getTime();
    });
  }, [savedTrains]);

  // Swipe to fullscreen = enter Add Train search; leave fullscreen = exit search
  useEffect(() => {
    if (isFullscreen && !isSearchFocused) {
      setIsSearchFocused(true);
    } else if (!isFullscreen && isSearchFocused) {
      setIsSearchFocused(false);
    }
  }, [isFullscreen]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally omits isSearchFocused to avoid loops

  const handleOpenSearch = () => {
    snapToPoint?.('max');
    setIsSearchFocused(true);
  };

  const handleCloseSearch = () => {
    setIsSearchFocused(false);
    snapToPoint?.('min');
  };

  const handleSelectTrip = async (tripId: string, fromCode: string, toCode: string, date: Date) => {
    await saveTrainWithSegment(tripId, fromCode, toCode, date);
    setIsSearchFocused(false);
    snapToPoint?.('min');
  };

  const handleDeleteTrain = useCallback(async (train: Train) => {
    await TrainStorageService.deleteTrainByTripId(train.tripId || '', train.fromCode, train.toCode, train.travelDate);
    const updatedTrains = await TrainStorageService.getSavedTrains();
    setSavedTrains(updatedTrains);
    TrainActivityManager.onTrainDeleted(train.tripId || '', train.fromCode, train.toCode).catch(e => logger.warn('TrainActivityManager.onTrainDeleted failed', e));
  }, [setSavedTrains]);

  const handleTrainSelect = useCallback((train: Train) => {
    setSelectedTrain(train);
    if (typeof onTrainSelect === 'function') onTrainSelect(train);
  }, [setSelectedTrain, onTrainSelect]);

  const trainKeyExtractor = useCallback((item: Train) => String(item.id), []);

  const renderTrainItem = useCallback(({ item, index }: { item: Train; index: number }) => (
    <SwipeableTrainCard
      train={item}
      onPress={handleTrainSelect}
      onDelete={handleDeleteTrain}
      isFirst={index === 0}
      isLast={index === sortedTrains.length - 1}
      contentOpacity={contentOpacity}
    />
  ), [handleTrainSelect, handleDeleteTrain, sortedTrains.length, contentOpacity]);

  const contentContainerStyle = useMemo(() => ({
    paddingBottom: isFullscreen ? 100 : windowHeight * 0.5,
  }), [isFullscreen, windowHeight]);

  const trainListEmpty = useMemo(() => (
    <PlaceholderBlurb
      icon="bookmark-outline"
      title="No saved trips yet"
      subtitle="Use the search bar to add a trip"
    />
  ), []);

  return (
    <View style={{ flex: 1 }}>
      {/* Fixed Header */}
      <View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{isSearchFocused ? 'Add Train' : 'My Trains'}</Text>
        </View>
        {!isSearchFocused && !isLoading && (
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              onOpenProfile?.();
            }}
            style={styles.refreshButton}
            activeOpacity={0.7}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Ionicons name="person" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}

        {isSearchFocused && <Text style={styles.subtitle}>Search by train number, route, or station</Text>}

        {/* Search Button (when not searching) */}
        {!isLoading && !isSearchFocused && (
          <TouchableOpacity
            style={styles.searchContainer}
            activeOpacity={0.7}
            onPress={() => {
              hapticLight();
              handleOpenSearch();
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Add a train"
          >
            <Ionicons name="search" size={20} color={colors.secondary} />
            <Text style={styles.searchButtonText}>Train number, route, or station</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flex: 1 }} pointerEvents="auto">
        {/* Search lives outside ScrollView so the input stays fixed */}
        {isSearchFocused && !isCollapsed && (
          <Animated.View style={[{ flex: 1 }, fadeAnimatedStyle]}>
            <TwoStationSearch onSelectTrip={handleSelectTrip} onClose={handleCloseSearch} />
          </Animated.View>
        )}

        {/* Virtualized Train List */}
        {!isSearchFocused && !isLoading && (
          <FlatList
            ref={flatListRef}
            data={sortedTrains}
            keyExtractor={trainKeyExtractor}
            renderItem={renderTrainItem}
            ListEmptyComponent={trainListEmpty}
            style={{ flex: 1 }}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={false}
            scrollEnabled={isFullscreen}
            nestedScrollEnabled={true}
            onScroll={e => {
              scrollOffset.value = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            waitFor={panRef}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={9}
            removeClippedSubviews={true}
          />
        )}
      </View>
    </View>
  );
});
