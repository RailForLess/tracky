import { light as hapticLight, heavy as hapticHeavy, success as hapticSuccess } from '../../utils/haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlatList, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { type ColorPalette, BorderRadius, FontSizes, Spacing, withTextShadow } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { PlaceholderBlurb } from '../PlaceholderBlurb';
import { useModalState } from '../../context/ModalContext';
import { useUnits } from '../../context/UnitsContext';
import { TrainStorageService } from '../../services/storage';
import type { CompletedTrip } from '../../types/train';
import { calculateProfileStats, formatDuration } from '../../utils/profile-stats';
import { formatDistance } from '../../utils/units';
import { error as logError } from '../../utils/logger';
import AnimatedRollingText from './AnimatedRollingText';
import { pluralCount } from '../../utils/train-display';
import MarqueeText from './MarqueeText';
import { SlideUpModalContext } from './SlideUpModal';

interface ProfileModalProps {
  onClose: () => void;
  onOpenSettings: () => void;
  onYearChange?: (year: number | null) => void;
}

function buildTicketArt(header: string, rows: [string, string][]): string {
  const edge = '✂ - - - - - - - -';
  const lines = [
    edge,
    '',
    `  ${header}`,
    '',
    ...rows.map(([l, v]) => `  ${l}: ${v}`),
    '',
    '  🚂 via Tracky',
    '',
    edge,
  ];
  return lines.join('\n');
}

const FIRST_THRESHOLD = -80;
const SECOND_THRESHOLD = -200;

const SwipeableHistoryCard = React.memo(function SwipeableHistoryCard({
  trip,
  onDelete,
  isLast,
}: {
  trip: CompletedTrip;
  onDelete: () => void;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  const swipeStyles = useMemo(() => createSwipeStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateX = useSharedValue(0);
  const hasTriggeredSecondHaptic = useSharedValue(false);
  const isDeleting = useSharedValue(false);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const panDecided = useSharedValue(false);

  const triggerSecondHaptic = () => {
    hapticHeavy();
  };

  const triggerDeleteHaptic = () => {
    hapticSuccess();
  };

  const handleDelete = () => {
    triggerDeleteHaptic();
    onDelete();
  };

  const performDelete = () => {
    isDeleting.value = true;
    translateX.value = withTiming(-500, { duration: 200 }, () => {
      runOnJS(handleDelete)();
    });
  };

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event, stateManager) => {
      if (event.numberOfTouches > 1) {
        stateManager.fail();
        return;
      }
      panStartX.value = event.allTouches[0].absoluteX;
      panStartY.value = event.allTouches[0].absoluteY;
      panDecided.value = false;
    })
    .onTouchesMove((event, stateManager) => {
      if (panDecided.value || event.numberOfTouches === 0) return;
      if (event.numberOfTouches > 1) {
        stateManager.fail();
        panDecided.value = true;
        return;
      }
      const dx = event.allTouches[0].absoluteX - panStartX.value;
      const dy = event.allTouches[0].absoluteY - panStartY.value;

      if (Math.abs(dy) > 15) {
        stateManager.fail();
        panDecided.value = true;
        return;
      }
      if (Math.abs(dx) > 10) {
        stateManager.activate();
        panDecided.value = true;
      }
    })
    .onUpdate(event => {
      if (isDeleting.value) return;
      const clampedX = Math.min(0, event.translationX);
      translateX.value = clampedX;

      if (clampedX <= SECOND_THRESHOLD && !hasTriggeredSecondHaptic.value) {
        hasTriggeredSecondHaptic.value = true;
        runOnJS(triggerSecondHaptic)();
      } else if (clampedX > SECOND_THRESHOLD && hasTriggeredSecondHaptic.value) {
        hasTriggeredSecondHaptic.value = false;
      }
    })
    .onEnd(event => {
      if (isDeleting.value) return;

      const fastSwipe = event.velocityX < -800;

      if (translateX.value <= SECOND_THRESHOLD) {
        runOnJS(performDelete)();
      } else if (translateX.value <= FIRST_THRESHOLD || fastSwipe) {
        translateX.value = withSpring(FIRST_THRESHOLD, {
          damping: 50,
          stiffness: 200,
        });
      } else {
        translateX.value = withSpring(0, {
          damping: 50,
          stiffness: 200,
        });
      }
      hasTriggeredSecondHaptic.value = false;
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (isDeleting.value) return;
    if (translateX.value < -10) {
      translateX.value = withSpring(0, { damping: 50, stiffness: 200 });
    }
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const fadeProgress = interpolate(absX, [Math.abs(FIRST_THRESHOLD), Math.abs(SECOND_THRESHOLD)], [1, 0], 'clamp');
    return {
      transform: [{ translateX: translateX.value }],
      opacity: fadeProgress,
    };
  });

  const deleteContainerAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const progress = Math.min(1, absX / Math.abs(FIRST_THRESHOLD));
    return {
      opacity: progress,
      width: absX > 0 ? absX : 0,
    };
  });

  const deleteButtonAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const pastSecond = absX >= Math.abs(SECOND_THRESHOLD);
    return {
      justifyContent: pastSecond ? 'flex-start' : 'center',
      paddingLeft: pastSecond ? 16 : 0,
    };
  });

  const handleDeletePress = () => {
    performDelete();
  };

  return (
    <View style={swipeStyles.container}>
      {/* Delete button behind the card */}
      <Animated.View style={[swipeStyles.deleteButtonContainer, deleteContainerAnimatedStyle]}>
        <View style={swipeStyles.deleteButtonWrapper}>
          <GestureDetector gesture={Gesture.Tap().onEnd(() => runOnJS(handleDeletePress)())}>
            <Animated.View style={[swipeStyles.deleteButton, deleteButtonAnimatedStyle]}>
              <Ionicons name="trash" size={22} color={colors.primary} />
            </Animated.View>
          </GestureDetector>
        </View>
      </Animated.View>

      {/* The actual card */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.historyCard, cardAnimatedStyle]}>
          <View style={styles.historyDetailRow}>
            <Image source={require('../../assets/images/amtrak.png')} style={styles.amtrakLogo} fadeDuration={0} />
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <MarqueeText
                text={`${trip.routeName || 'Amtrak'} · ${trip.fromCode} → ${trip.toCode} · ${trip.duration ? formatDuration(trip.duration) : '—'}`}
                style={styles.historyDetailText}
              />
            </View>
            <Text style={styles.historyDate}>{trip.date}</Text>
          </View>

          <Text style={styles.historyRouteName}>
            {trip.from} to {trip.to}
          </Text>
        </Animated.View>
      </GestureDetector>
      {!isLast && <View style={swipeStyles.separator} />}
    </View>
  );
});

type SortField = 'date' | 'from' | 'to' | 'route';
type SortDirection = 'asc' | 'desc';

type ListItem =
  | { type: 'group-header'; key: string; groupKey: string; count: number }
  | { type: 'trip'; key: string; trip: CompletedTrip; isLast: boolean };

export default function ProfileModal({ onClose, onOpenSettings, onYearChange }: ProfileModalProps) {
  const { colors, isDark, closeButtonStyle } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [history, setHistory] = useState<CompletedTrip[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { isFullscreen, scrollOffset, panRef } = React.useContext(SlideUpModalContext);
  const { distanceUnit } = useUnits();
  const { activeModal } = useModalState();

  const currentYear = new Date().getFullYear();

  // Get unique years from trip history, sorted descending
  const years = useMemo(() => {
    const yearSet = new Set<number>();
    history.forEach(trip => {
      const tripYear = new Date(trip.travelDate).getFullYear();
      yearSet.add(tripYear);
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [history]);

  const isActive = activeModal === 'profile';

  // Ref for imperatively scrolling to top
  const flatListRef = useRef<FlatList<ListItem>>(null);

  // Load history on mount and refresh when profile becomes active
  useEffect(() => {
    if (!isActive) return;
    TrainStorageService.backfillHistoryStats()
      .then(() => TrainStorageService.getTripHistory())
      .then(setHistory);
    // Always scroll to top when navigating to Profile
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [isActive]);

  const handleDeleteHistory = useCallback(async (trip: CompletedTrip) => {
    await TrainStorageService.deleteFromHistory(trip.tripId, trip.fromCode, trip.toCode, trip.travelDate);
    const updated = await TrainStorageService.getTripHistory();
    setHistory(updated);
  }, []);

  const stats = useMemo(() => calculateProfileStats(history, selectedYear || undefined), [history, selectedYear]);

  // Toggle sort field or direction
  const handleSortPress = useCallback(
    (field: SortField) => {
      hapticLight();
      if (sortField === field) {
        // Toggle direction if same field
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        // New field, default to descending for date, ascending for others
        setSortField(field);
        setSortDirection(field === 'date' ? 'desc' : 'asc');
      }
    },
    [sortField]
  );

  // Filter and sort history
  const filteredAndSortedHistory = useMemo(() => {
    let filtered = history.filter(trip => {
      if (!selectedYear) return true;
      return new Date(trip.travelDate).getFullYear() === selectedYear;
    });

    // Sort based on selected field
    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          comparison = new Date(a.travelDate).getTime() - new Date(b.travelDate).getTime();
          break;
        case 'from':
          comparison = (a.from || '').localeCompare(b.from || '');
          break;
        case 'to':
          comparison = (a.to || '').localeCompare(b.to || '');
          break;
        case 'route':
          comparison = (a.routeName || '').localeCompare(b.routeName || '');
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [history, selectedYear, sortField, sortDirection]);

  // Group trips based on sort field
  const groupedTrips = useMemo(() => {
    const groups: { [key: string]: CompletedTrip[] } = {};

    filteredAndSortedHistory.forEach(trip => {
      let groupKey = '';

      switch (sortField) {
        case 'date':
          groupKey = new Date(trip.travelDate).getFullYear().toString();
          break;
        case 'from':
          groupKey = `${trip.from} (${trip.fromCode})`;
          break;
        case 'to':
          groupKey = `${trip.to} (${trip.toCode})`;
          break;
        case 'route':
          groupKey = trip.routeName || 'Unknown Route';
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(trip);
    });

    // Sort group keys based on field type and direction
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        // For dates (years), sort numerically
        comparison = parseInt(a) - parseInt(b);
      } else {
        // For other fields, sort alphabetically
        comparison = a.localeCompare(b);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Return ordered array of [key, value] pairs
    return sortedGroupKeys.map(key => [key, groups[key]] as [string, CompletedTrip[]]);
  }, [filteredAndSortedHistory, sortField, sortDirection]);

  const handleSharePassport = useCallback(async () => {
    hapticLight();
    const yearText = `${selectedYear || 'All-Time'}`;
    const message = buildTicketArt(
      `SUPERTICKET ${yearText}`,
      [
        ['Trips', `${stats.totalTrips}`],
        ['Distance', formatDistance(stats.totalDistance, distanceUnit)],
        ['Travel Time', formatDuration(stats.totalDuration)],
        ['Stations', `${stats.uniqueStations}`],
        ['Routes', `${stats.uniqueRoutes}`],
      ],
    );

    try {
      await Share.share({ message });
    } catch (error) {
      logError('[Profile] Error sharing:', error);
    }
  }, [selectedYear, stats, distanceUnit]);

  const handleShareDelays = useCallback(async () => {
    hapticLight();
    const yearText = `${selectedYear || 'All-Time'}`;
    const totalHours = Math.floor(stats.totalDelayMinutes / 60);
    const avgMinutes = Math.round(stats.averageDelayMinutes);

    const message = buildTicketArt(
      `DELAY REPORT ${yearText}`,
      [
        ['Hours Lost', `${totalHours}`],
        ['Avg Delay', `${avgMinutes}m`],
        ['Delayed Trips', `${stats.delayedTripsCount}`],
      ],
    );

    try {
      await Share.share({ message });
    } catch (error) {
      logError('[Profile] Error sharing:', error);
    }
  }, [selectedYear, stats]);

  const handleShareMostRidden = useCallback(async () => {
    hapticLight();
    if (!stats.mostRiddenRoute) return;

    const message = buildTicketArt(
      'FREQUENT RIDER',
      [
        ['Route', stats.mostRiddenRoute.routeName],
        ['Trips', `${stats.mostRiddenRoute.count}`],
      ],
    );

    try {
      await Share.share({ message });
    } catch (error) {
      logError('[Profile] Error sharing:', error);
    }
  }, [stats]);

  const handleYearPress = useCallback((year: number | null) => {
    hapticLight();
    setSelectedYear(year);
    onYearChange?.(year);
  }, [onYearChange]);

  const handleClosePress = useCallback(() => {
    hapticLight();
    onClose();
  }, [onClose]);

  const handleSettingsPress = useCallback(() => {
    hapticLight();
    onOpenSettings();
  }, [onOpenSettings]);

  const handleComingSoon = useCallback((title: string, message: string) => {
    hapticLight();
    Alert.alert(title, message);
  }, []);

  // Flatten grouped trips into a single list for FlatList virtualization
  const flatListData = useMemo<ListItem[]>(() => {
    if (filteredAndSortedHistory.length === 0) return [];
    const items: ListItem[] = [];
    for (const [groupKey, trips] of groupedTrips) {
      items.push({ type: 'group-header', key: `header-${groupKey}`, groupKey, count: trips.length });
      trips.forEach((trip, index) => {
        items.push({
          type: 'trip',
          key: `${trip.tripId}-${trip.fromCode}-${trip.toCode}-${trip.travelDate}`,
          trip,
          isLast: index === trips.length - 1,
        });
      });
    }
    return items;
  }, [groupedTrips, filteredAndSortedHistory.length]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'group-header') {
      return (
        <View>
          <View style={styles.groupHeader}>
            <Text style={styles.groupHeaderText}>{item.groupKey}</Text>
            <Text style={styles.groupHeaderCount}>
              {pluralCount(item.count, 'TRIP')}
            </Text>
          </View>
          <View style={styles.groupDivider} />
        </View>
      );
    }
    return (
      <SwipeableHistoryCard
        trip={item.trip}
        onDelete={() => handleDeleteHistory(item.trip)}
        isLast={item.isLast}
      />
    );
  }, [handleDeleteHistory]);

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  const listHeader = useMemo(() => (
    <>
      {/* Superticket Card */}
      <View style={styles.passportCard}>
        <View style={styles.passportHeader}>
          <View style={styles.passportTitleRow}>
            <MaterialCommunityIcons name="train" size={16} color={'#fff'} />
            <Text style={styles.passportTitle}>{selectedYear || 'ALL-TIME'} SUPERTICKET</Text>
          </View>
          <TouchableOpacity
            onPress={handleSharePassport}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={22} color={'#fff'} />
          </TouchableOpacity>
        </View>
        <Text style={styles.passportSubtitle}>🎫 SUPERTICKET · RAIL · EXPRESS</Text>

        <View style={styles.passportStatsGrid}>
          <View style={styles.passportStatBlock}>
            <Text style={styles.passportStatLabel}>TRIPS</Text>
            <AnimatedRollingText value={String(stats.totalTrips)} style={styles.passportStatValue} />
          </View>
          <View style={styles.passportStatBlock}>
            <Text style={styles.passportStatLabel}>DISTANCE</Text>
            <AnimatedRollingText value={formatDistance(stats.totalDistance, distanceUnit)} style={styles.passportStatValue} />
            <AnimatedRollingText
              value={stats.totalDistance > 0 ? `${(stats.totalDistance / 24901).toFixed(1)}x around the world` : '—'}
              style={styles.passportStatSubtext}
            />
          </View>
        </View>

        <View style={styles.passportStatsRow}>
          <View style={styles.passportStatSmall}>
            <Text style={styles.passportStatLabel}>TRAVEL TIME</Text>
            <AnimatedRollingText value={formatDuration(stats.totalDuration)} style={styles.passportStatValueSmall} />
          </View>
          <View style={styles.passportStatSmall}>
            <Text style={styles.passportStatLabel}>STATIONS</Text>
            <AnimatedRollingText value={String(stats.uniqueStations)} style={styles.passportStatValueSmall} />
          </View>
          <View style={styles.passportStatSmall}>
            <Text style={styles.passportStatLabel}>ROUTES</Text>
            <AnimatedRollingText value={String(stats.uniqueRoutes)} style={styles.passportStatValueSmall} />
          </View>
        </View>

        <TouchableOpacity
          style={styles.allStatsButton}
          activeOpacity={0.7}
          onPress={() => handleComingSoon('Coming Soon', 'Detailed train stats are on the way!')}
        >
          <Text style={styles.allStatsButtonText}>All Train Stats</Text>
          <Ionicons name="chevron-forward" size={16} color={'#fff'} />
        </TouchableOpacity>
      </View>

      {/* Delay Stats Card */}
      <View style={styles.delayCard}>
        <View style={styles.delayHeader}>
          <AnimatedRollingText value={String(Math.floor(stats.totalDelayMinutes / 60))} style={styles.delayBigNumber} />
          <TouchableOpacity
            onPress={handleShareDelays}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={22} color={'#fff'} />
          </TouchableOpacity>
        </View>
        <Text style={styles.delayTitle}>hours lost from delays</Text>
        <AnimatedRollingText
          value={stats.delayedTripsCount > 0
            ? `Delayed trips averaged ${Math.round(stats.averageDelayMinutes)}m late`
            : 'No delays recorded yet'}
          style={styles.delaySubtext}
        />
        <TouchableOpacity
          style={styles.delayButton}
          activeOpacity={0.7}
          onPress={() => handleComingSoon('Coming Soon', 'Detailed delay stats are on the way!')}
        >
          <Text style={styles.delayButtonText}>All Delay Stats</Text>
          <Ionicons name="chevron-forward" size={16} color={'#fff'} />
        </TouchableOpacity>
      </View>

      {/* Most Ridden Route Card */}
      {stats.mostRiddenRoute && stats.mostRiddenRoute.count > 1 && (
        <View style={styles.mostRiddenCard}>
          <View style={styles.mostRiddenHeader}>
            <Text style={styles.mostRiddenTitle}>Most ridden route</Text>
            <TouchableOpacity
              onPress={handleShareMostRidden}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={22} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.mostRiddenRouteName}>{stats.mostRiddenRoute.routeName}</Text>
          <AnimatedRollingText value={`${stats.mostRiddenRoute.count} trips`} style={styles.mostRiddenCount} />
          <View style={styles.mostRiddenIcon}>
            <MaterialCommunityIcons name="train-car" size={32} color={colors.secondary} />
          </View>
        </View>
      )}

      {/* Trip History Section */}
      <Text style={styles.sectionLabel}>PAST TRIPS</Text>

      {/* Filter/Sort Bar */}
      {history.length > 0 && (
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterButton, sortField === 'date' && styles.filterButtonActive]}
            onPress={() => handleSortPress('date')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterButtonText, sortField === 'date' && styles.filterButtonTextActive]}>
              Date {sortField === 'date' && (sortDirection === 'desc' ? '↓' : '↑')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, sortField === 'from' && styles.filterButtonActive]}
            onPress={() => handleSortPress('from')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterButtonText, sortField === 'from' && styles.filterButtonTextActive]}>
              From {sortField === 'from' && (sortDirection === 'desc' ? '↓' : '↑')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, sortField === 'to' && styles.filterButtonActive]}
            onPress={() => handleSortPress('to')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterButtonText, sortField === 'to' && styles.filterButtonTextActive]}>
              To {sortField === 'to' && (sortDirection === 'desc' ? '↓' : '↑')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, sortField === 'route' && styles.filterButtonActive]}
            onPress={() => handleSortPress('route')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterButtonText, sortField === 'route' && styles.filterButtonTextActive]}>
              Route {sortField === 'route' && (sortDirection === 'desc' ? '↓' : '↑')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {filteredAndSortedHistory.length === 0 && (
        <PlaceholderBlurb
          icon="time-outline"
          title="No past trips yet"
          subtitle="Completed trips will appear here"
        />
      )}
    </>
  ), [selectedYear, stats, distanceUnit, history.length, sortField, sortDirection, filteredAndSortedHistory.length, handleSharePassport, handleShareDelays, handleShareMostRidden, handleSortPress, handleComingSoon, styles, colors]);

  return (
    <View style={{ flex: 1, marginHorizontal: -Spacing.xl }}>
      {/* Header with Profile Info */}
      <View style={[styles.profileHeader, { paddingHorizontal: Spacing.xl }]}>
        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarEmoji}>🚂</Text>
          </View>
          <View style={styles.profileTextContainer}>
            <Text style={styles.profileName}>Tracky</Text>
            <Text style={styles.profileSubtitle}>My Train Log</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleClosePress} style={closeButtonStyle} activeOpacity={0.6}>
          <Ionicons name="close" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Action Pills */}
      <View style={[styles.actionPillsContainer, { paddingHorizontal: Spacing.xl }]}>
        <TouchableOpacity style={styles.actionPill} activeOpacity={0.7} onPress={handleSettingsPress}>
          <Ionicons name="settings-sharp" size={14} color={colors.primary} />
          <Text style={styles.actionPillText}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Year Filter */}
      {history.length > 0 && (
        <View style={[styles.yearFilterContainer, { paddingHorizontal: Spacing.xl }]}>
          <TouchableOpacity
            style={[styles.yearButton, selectedYear === null && styles.yearButtonActive]}
            onPress={() => handleYearPress(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.yearButtonText, selectedYear === null && styles.yearButtonTextActive]}>ALL-TIME</Text>
          </TouchableOpacity>
          {years.map(year => (
            <TouchableOpacity
              key={year}
              style={[styles.yearButton, selectedYear === year && styles.yearButtonActive]}
              onPress={() => handleYearPress(year)}
              activeOpacity={0.7}
            >
              <Text style={[styles.yearButtonText, selectedYear === year && styles.yearButtonTextActive]}>{year}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Virtualized Scrollable Content */}
      <FlatList
        ref={flatListRef}
        data={flatListData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={true}
        scrollEnabled={isFullscreen}
        bounces={false}
        nestedScrollEnabled={true}
        onScroll={e => {
          scrollOffset.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        waitFor={panRef}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: Spacing.xl, paddingBottom: isFullscreen ? 100 : 400 }]}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={true}
      />
    </View>
  );
}

const createSwipeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: {
    position: 'relative',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.primary,
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingRight: 4,
    paddingLeft: 12,
  },
  deleteButtonWrapper: {
    height: 44,
    flex: 1,
    justifyContent: 'center',
  },
  deleteButton: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
});

const createStyles = (colors: ColorPalette, isDark: boolean) => StyleSheet.create(withTextShadow({
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: isDark ? colors.background.secondary : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border.primary,
  },
  avatarEmoji: {
    fontSize: 32,
  },
  profileTextContainer: {
    gap: 2,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  profileSubtitle: {
    fontSize: 15,
    color: colors.secondary,
  },
  actionPillsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  yearFilterContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  yearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  yearButtonActive: {
    backgroundColor: colors.background.secondary,
  },
  yearButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
  },
  yearButtonTextActive: {
    color: colors.primary,
  },
  scrollContent: {},
  passportCard: {
    backgroundColor: '#3949AB',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  passportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  passportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  passportSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: Spacing.lg,
    letterSpacing: 0.5,
  },
  passportStatsGrid: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  passportStatBlock: {
    flex: 1,
  },
  passportStatLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  passportStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  passportStatSubtext: {
    fontSize: 13,
    color: '#fff',
    marginTop: 2,
  },
  passportStatsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  passportStatSmall: {
    flex: 1,
  },
  passportStatValueSmall: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  allStatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  allStatsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  delayCard: {
    backgroundColor: '#B71C1C',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  delayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  delayBigNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 64,
  },
  delayTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: Spacing.sm,
  },
  delaySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: Spacing.lg,
  },
  delayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  delayButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  mostRiddenCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 200,
  },
  mostRiddenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  mostRiddenTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondary,
  },
  mostRiddenRouteName: {
    fontSize: 42,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: Spacing.xs,
  },
  mostRiddenCount: {
    fontSize: 16,
    color: colors.secondary,
  },
  mostRiddenIcon: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    opacity: 0.15,
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.secondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
    marginTop: Spacing.md,
    fontWeight: '600',
  },
  filterBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: 2,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  filterButtonActive: {
    backgroundColor: colors.background.primary,
    borderColor: colors.border.primary,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondary,
  },
  filterButtonTextActive: {
    color: colors.primary,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: 2,
  },
  groupHeaderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  groupHeaderCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
    letterSpacing: 0.5,
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.primary,
  },
  historyCard: {
    padding: Spacing.lg,
  },
  historyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  amtrakLogo: {
    width: 16,
    height: 16,
    marginRight: 3,
    resizeMode: 'contain',
  },
  historyDetailText: {
    fontSize: 13,
    color: colors.secondary,
  },
  historyDate: {
    fontSize: FontSizes.trainDate,
    color: colors.secondary,
    marginLeft: 'auto',
  },
  historyRouteName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
}, colors.textShadow));
