import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, StyleSheet, TextInput } from 'react-native';
import { type ColorPalette, BorderRadius, FontSizes, Spacing, withTextShadow } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { light as hapticLight, selection as hapticSelection, success as hapticSuccess } from '../utils/haptics';
import { RealtimeService } from '../services/realtime';
import { TrainStorageService } from '../services/storage';
import type { EnrichedStopTime, Route, SearchResult, Stop } from '../types/train';
import { useTrainContext } from '../context/TrainContext';
import { SlideUpModalContext } from './ui/SlideUpModal';
import { gtfsParser } from '../utils/gtfs-parser';
import { logger } from '../utils/logger';
import { LocationSuggestionsService } from '../services/location-suggestions';
import { pluralCount } from '../utils/train-display';
import { formatDateForDisplay } from '../utils/date-helpers';
import type { DateData } from 'react-native-calendars';

import { SearchResultsList } from './search/SearchResultsList';
import { TrainFlowView } from './search/TrainFlowView';
import { StationFlowView } from './search/StationFlowView';

// --- Exported interfaces ---

export interface TripResult {
  tripId: string;
  fromStop: EnrichedStopTime;
  toStop: EnrichedStopTime;
  intermediateStops: EnrichedStopTime[];
}

interface TwoStationSearchProps {
  onSelectTrip: (tripId: string, fromCode: string, toCode: string, date: Date) => void;
  onClose: () => void;
}

export interface UnifiedResults {
  trains: SearchResult[];
  routes: SearchResult[];
  stations: SearchResult[];
}

// Sub-list shown when a route is selected (before picking a specific train)
export interface RouteTrainItem {
  trainNumber: string;
  displayName: string;
  headsign: string;
  endpointLabel: string;
}

export type SuggestionItem = {
  type: 'route' | 'station' | 'train';
  label: string;
  subtitle: string;
  routeId?: string;
  stop?: Stop;
  toStop?: Stop;
  trainNumber?: string;
  displayName?: string;
};

// --- Exported helper functions ---

const formatDateForPill = formatDateForDisplay;

export function getCountdownFromDeparture(departureTime: string, travelDate: Date, delayMinutes?: number): { value: number; unit: string; past: boolean } {
  const { getCurrentSecondsInTimezone } = require('../utils/timezone');
  const [hStr, mStr] = departureTime.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const departSecOfDay = h * 3600 + m * 60 // handles GTFS h>=24 naturally
    + (delayMinutes && delayMinutes > 0 ? delayMinutes * 60 : 0);

  const tz = gtfsParser.agencyTimezone;
  const now = new Date();
  const nowSec = getCurrentSecondsInTimezone(tz);

  // Get today's date in agency timezone
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || undefined,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const todayYear = parseInt(todayParts.find(p => p.type === 'year')!.value, 10);
  const todayMonth = parseInt(todayParts.find(p => p.type === 'month')!.value, 10);
  const todayDay = parseInt(todayParts.find(p => p.type === 'day')!.value, 10);

  // Day difference between travelDate and today (in agency tz)
  const travelDay = new Date(travelDate.getFullYear(), travelDate.getMonth(), travelDate.getDate());
  const todayDate = new Date(todayYear, todayMonth - 1, todayDay);
  const dayDiff = Math.round((travelDay.getTime() - todayDate.getTime()) / 86400000);

  const deltaSec = dayDiff * 86400 + departSecOfDay - nowSec;
  const past = deltaSec < 0;
  const absSec = Math.abs(deltaSec);

  const days = Math.round(absSec / 86400);
  if (days >= 1) return { value: days, unit: days === 1 ? 'DAY' : 'DAYS', past };
  const hours = Math.round(absSec / 3600);
  if (hours >= 1) return { value: hours, unit: hours === 1 ? 'HOUR' : 'HOURS', past };
  const minutes = Math.round(absSec / 60);
  if (minutes >= 1) return { value: minutes, unit: minutes === 1 ? 'MINUTE' : 'MINUTES', past };
  const seconds = Math.round(absSec);
  return { value: seconds, unit: seconds === 1 ? 'SECOND' : 'SECONDS', past };
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const getCalendarTheme = (colors: ColorPalette, isDark: boolean) => ({
  calendarBackground: colors.background.tertiary,
  dayTextColor: colors.primary,
  monthTextColor: colors.primary,
  arrowColor: colors.primary,
  selectedDayBackgroundColor: '#FFFFFF',
  selectedDayTextColor: '#000000',
  textDisabledColor: colors.tertiary,
  todayTextColor: colors.primary,
  todayBackgroundColor: colors.background.primary,
  textSectionTitleColor: colors.secondary,
  textDayFontWeight: 'bold' as const,
  textMonthFontWeight: 'bold' as const,
  textDayHeaderFontWeight: 'bold' as const,
  textMonthFontSize: 18,
});

export function TwoStationSearch({ onSelectTrip, onClose }: TwoStationSearchProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const calendarTheme = useMemo(() => getCalendarTheme(colors, isDark), [colors, isDark]);
  const { panRef, scrollOffset, isFullscreen } = React.useContext(SlideUpModalContext);

  // --- Keyboard height tracking ---
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // --- Shared state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(gtfsParser.isLoaded);
  const searchInputRef = useRef<TextInput>(null);

  // --- Station flow state (Path 2a) ---
  const [fromStation, setFromStation] = useState<Stop | null>(null);
  const [toStation, setToStation] = useState<Stop | null>(null);
  const [stationResults, setStationResults] = useState<Stop[]>([]);
  const [tripResults, setTripResults] = useState<TripResult[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripDelays, setTripDelays] = useState<Map<string, { departDelay?: number; arriveDelay?: number }>>(new Map());
  const [activeField, setActiveField] = useState<'from' | 'to'>('from');

  // --- Train-number flow state (Path 2b) ---
  const [selectedTrainNumber, setSelectedTrainNumber] = useState<string | null>(null);
  const [selectedTrainName, setSelectedTrainName] = useState<string>('');
  const [resolvedTripId, setResolvedTripId] = useState<string | null>(null);
  const [trainStops, setTrainStops] = useState<EnrichedStopTime[]>([]);
  const [selectedFromStop, setSelectedFromStop] = useState<EnrichedStopTime | null>(null);
  const [trainNotRunning, setTrainNotRunning] = useState(false);

  // --- Unified search state (Path 1) ---
  const [unifiedResults, setUnifiedResults] = useState<UnifiedResults>({ trains: [], routes: [], stations: [] });

  // --- Route expansion state ---
  const [expandedRouteTrains, setExpandedRouteTrains] = useState<RouteTrainItem[] | null>(null);
  const [expandedRouteName, setExpandedRouteName] = useState<string>('');
  const [liveTrainNumbers, setLiveTrainNumbers] = useState<Set<string>>(new Set());
  const [filterLiveOnly, setFilterLiveOnly] = useState(false);
  const [routeFilterQuery, setRouteFilterQuery] = useState('');

  // --- Suggestions for empty search (three independent sections) ---
  const [nearbySuggestions, setNearbySuggestions] = useState<SuggestionItem[]>([]);
  const [historySuggestions, setHistorySuggestions] = useState<SuggestionItem[]>([]);
  const [popularSuggestions, setPopularSuggestions] = useState<SuggestionItem[]>([]);

  // --- "Alternatives to my train today" ---
  const { savedTrains } = useTrainContext();
  const todayTrain = useMemo(() => {
    const now = new Date();
    return savedTrains.find(t => t.daysAway === 0 && t.fromCode && t.toCode);
  }, [savedTrains]);

  useEffect(() => {
    if (!isDataLoaded) return;

    // Popular (always shown)
    const allRoutes = gtfsParser.getAllRoutes();
    const popular: SuggestionItem[] = [];
    const nerRoute = allRoutes.find(r => r.route_long_name.toLowerCase().includes('northeast regional'));
    if (nerRoute) {
      popular.push({ type: 'route', label: 'Northeast Regional', subtitle: 'Route', routeId: nerRoute.route_id });
    }
    const acelaRoute = allRoutes.find(r => r.route_long_name.toLowerCase().includes('acela'));
    if (acelaRoute) {
      popular.push({ type: 'route', label: 'Acela', subtitle: 'Route', routeId: acelaRoute.route_id });
    }
    const nyp = gtfsParser.getStop('NYP');
    if (nyp) {
      popular.push({ type: 'station', label: nyp.stop_name, subtitle: 'NYP \u00B7 Station', stop: nyp });
    }
    setPopularSuggestions(popular);

    // Nearby (from location service)
    const locationSuggestions = LocationSuggestionsService.getCachedSuggestions();
    if (locationSuggestions && locationSuggestions.length > 0) {
      setNearbySuggestions(locationSuggestions);
    }

    // History
    TrainStorageService.getTripHistory().then(history => {
      if (history.length > 0) {
        const routeCounts = new Map<string, { count: number; routeName: string; fromCode: string; toCode: string }>();
        for (const trip of history) {
          const key = `${trip.fromCode}-${trip.toCode}`;
          const existing = routeCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            routeCounts.set(key, { count: 1, routeName: trip.routeName, fromCode: trip.fromCode, toCode: trip.toCode });
          }
        }
        const sorted = [...routeCounts.values()].sort((a, b) => b.count - a.count).slice(0, 1);
        setHistorySuggestions(sorted.map(r => ({
          type: 'station' as const,
          label: `${r.fromCode} \u2192 ${r.toCode}`,
          subtitle: `${r.routeName} \u00B7 ${pluralCount(r.count, 'trip')}`,
          stop: gtfsParser.getStop(r.fromCode) || undefined,
          toStop: gtfsParser.getStop(r.toCode) || undefined,
        })));
      }
    });
  }, [isDataLoaded]);

  // --- Train service date range (for constraining date picker in train flow) ---
  const trainServiceInfo = useMemo(() => {
    if (!selectedTrainNumber || !isDataLoaded) return null;
    return gtfsParser.getServiceInfoForTrain(selectedTrainNumber);
  }, [selectedTrainNumber, isDataLoaded]);

  // Check if GTFS data is loaded
  useEffect(() => {
    const checkLoaded = () => {
      if (gtfsParser.isLoaded && !isDataLoaded) {
        setIsDataLoaded(true);
      }
    };
    checkLoaded();
    const interval = setInterval(checkLoaded, 500);
    return () => clearInterval(interval);
  }, [isDataLoaded]);

  // Search logic -- branches based on current state
  useEffect(() => {
    if (!isDataLoaded || searchQuery.length === 0) {
      setUnifiedResults({ trains: [], routes: [], stations: [] });
      setStationResults([]);
      return;
    }

    if (fromStation && !toStation) {
      // Station flow: picking arrival station
      const results = gtfsParser.searchStations(searchQuery);
      setStationResults(results);
    } else if (!fromStation && !selectedTrainNumber && !expandedRouteTrains) {
      // Initial view: unified search (skip when filtering within a route)
      const results = gtfsParser.searchUnified(searchQuery);
      setUnifiedResults(results);
    }
  }, [searchQuery, isDataLoaded, fromStation, toStation, selectedTrainNumber, expandedRouteTrains]);

  // Find trips when both stations AND date are selected (station flow)
  useEffect(() => {
    if (fromStation && toStation && selectedDate) {
      setLoadingTrips(true);
      setTripResults([]);
      // Defer heavy work so skeleton paints first
      const timeout = setTimeout(() => {
        logger.info(
          `[Search] Finding trips: ${fromStation.stop_name} \u2192 ${toStation.stop_name} on ${selectedDate.toLocaleDateString()}`
        );
        const trips = gtfsParser.findTripsWithStops(fromStation.stop_id, toStation.stop_id, selectedDate);
        logger.info(`[Search] Found ${trips.length} trips`);
        setTripResults(trips);
        setLoadingTrips(false);
      }, 50);
      return () => clearTimeout(timeout);
    } else {
      setTripResults([]);
      setLoadingTrips(false);
    }
  }, [fromStation, toStation, selectedDate]);

  // Fetch delays for today's search results
  useEffect(() => {
    if (tripResults.length === 0 || !selectedDate) {
      setTripDelays(new Map());
      return;
    }
    // Only fetch delays if the selected date is today
    const now = new Date();
    const isToday =
      selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate();
    if (!isToday) {
      setTripDelays(new Map());
      return;
    }

    let cancelled = false;
    const fetchDelays = async () => {
      const delays = new Map<string, { departDelay?: number; arriveDelay?: number }>();
      await Promise.all(
        tripResults.map(async (trip) => {
          const [depDelay, arrDelay] = await Promise.all([
            RealtimeService.getDelayForStop(trip.tripId, trip.fromStop.stop_id),
            RealtimeService.getArrivalDelayForStop(trip.tripId, trip.toStop.stop_id),
          ]);
          if (depDelay != null || arrDelay != null) {
            delays.set(trip.tripId, {
              departDelay: depDelay ?? undefined,
              arriveDelay: arrDelay ?? undefined,
            });
          }
        })
      );
      if (!cancelled) setTripDelays(delays);
    };

    fetchDelays();
    const interval = setInterval(fetchDelays, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tripResults, selectedDate]);

  // Show date picker when both stations are selected but no date yet (station flow)
  useEffect(() => {
    if (fromStation && toStation && !selectedDate) {
      setShowDatePicker(true);
    }
  }, [fromStation, toStation, selectedDate]);

  // Resolve trip when train number + date are both set (train flow)
  useEffect(() => {
    if (!selectedTrainNumber || !selectedDate) {
      setResolvedTripId(null);
      setTrainStops([]);
      setTrainNotRunning(false);
      return;
    }
    const trip = gtfsParser.getTripForTrainOnDate(selectedTrainNumber, selectedDate);
    if (!trip) {
      setTrainNotRunning(true);
      setResolvedTripId(null);
      setTrainStops([]);
      return;
    }
    // Check if this trip's service is actually active on the date
    const isActive = gtfsParser.isServiceActiveOnDate(trip.service_id, selectedDate);
    if (!isActive) {
      setTrainNotRunning(true);
      setResolvedTripId(null);
      setTrainStops([]);
      return;
    }
    setTrainNotRunning(false);
    setResolvedTripId(trip.trip_id);
    const stops = gtfsParser.getStopTimesForTrip(trip.trip_id);
    setTrainStops(stops);
  }, [selectedTrainNumber, selectedDate]);

  // --- Handlers ---

  const handleSelectStation = (station: Stop) => {
    hapticSelection();
    if (activeField === 'from') {
      setFromStation(station);
      setActiveField('to');
      setSearchQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setToStation(station);
      setSearchQuery('');
    }
  };

  const handleClearFrom = () => {
    hapticLight();
    setFromStation(null);
    setToStation(null);
    setSelectedDate(null);
    setTripResults([]);
    setActiveField('from');
    setSearchQuery('');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleClearTo = () => {
    hapticLight();
    setToStation(null);
    setSelectedDate(null);
    setTripResults([]);
    setActiveField('to');
    setSearchQuery('');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleClearDate = () => {
    hapticLight();
    setSelectedDate(null);
    setTripResults([]);
    setTrainStops([]);
    setResolvedTripId(null);
    setSelectedFromStop(null);
    setTrainNotRunning(false);
    setShowDatePicker(true);
  };

  const handleClearTrain = () => {
    hapticLight();
    setSelectedTrainNumber(null);
    setSelectedTrainName('');
    setSelectedDate(null);
    setResolvedTripId(null);
    setTrainStops([]);
    setSelectedFromStop(null);
    setTrainNotRunning(false);
    setExpandedRouteTrains(null);
    setExpandedRouteName('');
    setSearchQuery('');
    setRouteFilterQuery('');
    setFilterLiveOnly(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const calendarMinDate = useMemo(() => {
    if (trainServiceInfo) return toDateString(trainServiceInfo.minDate);
    return toDateString(new Date());
  }, [trainServiceInfo]);

  const calendarMaxDate = useMemo(() => {
    if (trainServiceInfo) return toDateString(trainServiceInfo.maxDate);
    return undefined;
  }, [trainServiceInfo]);

  const calendarMarkedDates = useMemo(() => {
    const marks: Record<string, { disabled?: boolean; disabledColor?: string; selected?: boolean; selectedColor?: string }> = {};

    if (selectedTrainNumber && trainServiceInfo && isDataLoaded) {
      const trips = gtfsParser.getTripsByNumber(selectedTrainNumber);
      if (trips.length > 0) {
        const current = new Date(trainServiceInfo.minDate);
        const end = trainServiceInfo.maxDate;
        while (current <= end) {
          const active = trips.some(trip => gtfsParser.isServiceActiveOnDate(trip.service_id, current));
          if (!active) {
            marks[toDateString(current)] = { disabled: true, disabledColor: '#555555' };
          }
          current.setDate(current.getDate() + 1);
        }
      }
    }

    if (selectedDate) {
      const key = toDateString(selectedDate);
      marks[key] = { ...marks[key], selected: true, selectedColor: '#FFFFFF' };
    }

    return marks;
  }, [selectedTrainNumber, trainServiceInfo, isDataLoaded, selectedDate]);

  const handleDayPress = (day: DateData) => {
    // Don't allow selecting disabled (greyed-out) dates
    const mark = calendarMarkedDates[day.dateString];
    if (mark?.disabled) return;

    hapticSuccess();
    const [y, m, d] = day.dateString.split('-').map(Number);
    setSelectedDate(new Date(y, m - 1, d));
    setShowDatePicker(false);
  };

  const handleSelectTrain = (trainNumber: string, displayName: string) => {
    hapticSelection();
    setSelectedTrainNumber(trainNumber);
    setSelectedTrainName(displayName);
    setSearchQuery('');
    setRouteFilterQuery('');
    setShowDatePicker(true);
    setExpandedRouteTrains(null);
    setExpandedRouteName('');
  };

  const handleSelectRoute = (route: Route) => {
    hapticSelection();
    const trains = gtfsParser.getTrainNumbersForRoute(route.route_id);
    if (trains.length === 1) {
      // Single train on route -- go directly to train flow
      handleSelectTrain(trains[0].trainNumber, trains[0].displayName);
    } else {
      setExpandedRouteTrains(trains);
      setExpandedRouteName(route.route_long_name);
      setSearchQuery('');
      // Fetch live train numbers for status indicators
      RealtimeService.getAllActiveTrains().then(active => {
        const nums = new Set(active.map(t => t.trainNumber));
        setLiveTrainNumbers(nums);
      }).catch(e => logger.warn('Failed to fetch active trains', e));
    }
  };

  const handleSelectTrainStop = (stop: EnrichedStopTime) => {
    if (!resolvedTripId || !selectedDate) return;

    if (!selectedFromStop) {
      // First tap -- set boarding stop
      hapticSelection();
      setSelectedFromStop(stop);
    } else if (stop.stop_sequence <= selectedFromStop.stop_sequence) {
      // Tapped earlier/same stop -- reset from to this stop
      hapticSelection();
      setSelectedFromStop(stop);
    } else {
      // Second tap -- destination stop, complete the selection
      hapticSuccess();
      onSelectTrip(resolvedTripId, selectedFromStop.stop_code, stop.stop_code, selectedDate);
    }
  };

  // --- Determine which view to render ---

  const hasUnifiedResults =
    unifiedResults.trains.length > 0 || unifiedResults.routes.length > 0 || unifiedResults.stations.length > 0;

  // ============================================================
  // PATH 1: Initial unified search (no station, no train selected)
  // ============================================================
  if (!fromStation && !selectedTrainNumber && !expandedRouteTrains) {
    return (
      <SearchResultsList
        styles={styles}
        colors={colors}
        isFullscreen={isFullscreen}
        screenHeight={SCREEN_HEIGHT}
        keyboardHeight={keyboardHeight}
        panRef={panRef}
        scrollOffset={scrollOffset}
        searchQuery={searchQuery}
        setSearchQuery={(text) => {
          setSearchQuery(text);
          setExpandedRouteName('');
        }}
        searchInputRef={searchInputRef}
        isDataLoaded={isDataLoaded}
        showDatePicker={showDatePicker}
        unifiedResults={unifiedResults}
        hasUnifiedResults={hasUnifiedResults}
        historySuggestions={historySuggestions}
        nearbySuggestions={nearbySuggestions}
        popularSuggestions={popularSuggestions}
        todayTrain={todayTrain}
        onClose={onClose}
        handleSelectStation={handleSelectStation}
        handleSelectRoute={handleSelectRoute}
        handleSelectTrain={handleSelectTrain}
        onTodayTripPress={() => {
          if (!todayTrain) return;
          hapticSelection();
          const from = gtfsParser.getStop(todayTrain.fromCode);
          const to = gtfsParser.getStop(todayTrain.toCode);
          if (from && to) {
            setFromStation(from);
            setToStation(to);
            setSearchQuery('');
            setSelectedDate(new Date());
          }
        }}
        onSuggestionPress={(suggestion) => {
          if (suggestion.type === 'train' && suggestion.trainNumber) {
            handleSelectTrain(suggestion.trainNumber, suggestion.displayName || suggestion.label);
          } else if (suggestion.type === 'route' && suggestion.routeId) {
            const route = gtfsParser.getRoute(suggestion.routeId);
            if (route) handleSelectRoute(route);
          } else if (suggestion.stop && suggestion.toStop) {
            hapticSelection();
            setFromStation(suggestion.stop);
            setToStation(suggestion.toStop);
            setSearchQuery('');
          } else if (suggestion.stop) {
            handleSelectStation(suggestion.stop);
          }
        }}
        hapticLight={hapticLight}
      />
    );
  }

  // ============================================================
  // PATH 2b: Train-number / route flow
  // ============================================================
  if (selectedTrainNumber || expandedRouteTrains) {
    return (
      <TrainFlowView
        styles={styles}
        colors={colors}
        isFullscreen={isFullscreen}
        screenHeight={SCREEN_HEIGHT}
        keyboardHeight={keyboardHeight}
        panRef={panRef}
        scrollOffset={scrollOffset}
        selectedTrainNumber={selectedTrainNumber}
        selectedTrainName={selectedTrainName}
        expandedRouteTrains={expandedRouteTrains}
        expandedRouteName={expandedRouteName}
        selectedDate={selectedDate}
        resolvedTripId={resolvedTripId}
        trainStops={trainStops}
        selectedFromStop={selectedFromStop}
        trainNotRunning={trainNotRunning}
        routeFilterQuery={routeFilterQuery}
        setRouteFilterQuery={setRouteFilterQuery}
        filterLiveOnly={filterLiveOnly}
        liveTrainNumbers={liveTrainNumbers}
        searchInputRef={searchInputRef}
        calendarTheme={calendarTheme}
        calendarMarkedDates={calendarMarkedDates}
        calendarMinDate={calendarMinDate}
        calendarMaxDate={calendarMaxDate}
        handleClearTrain={handleClearTrain}
        handleClearDate={handleClearDate}
        handleSelectTrain={handleSelectTrain}
        handleSelectTrainStop={handleSelectTrainStop}
        handleDayPress={handleDayPress}
        onFilterLiveToggle={() => {
          hapticSelection();
          setFilterLiveOnly(prev => !prev);
        }}
        formatDateForPill={formatDateForPill}
      />
    );
  }

  // ============================================================
  // PATH 2a: Station flow (existing, after fromStation is set)
  // ============================================================
  return (
    <StationFlowView
      styles={styles}
      colors={colors}
      isFullscreen={isFullscreen}
      screenHeight={SCREEN_HEIGHT}
      keyboardHeight={keyboardHeight}
      panRef={panRef}
      scrollOffset={scrollOffset}
      fromStation={fromStation!}
      toStation={toStation}
      selectedDate={selectedDate}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchInputRef={searchInputRef}
      isDataLoaded={isDataLoaded}
      showDatePicker={showDatePicker}
      stationResults={stationResults}
      tripResults={tripResults}
      loadingTrips={loadingTrips}
      tripDelays={tripDelays}
      calendarTheme={calendarTheme}
      calendarMarkedDates={calendarMarkedDates}
      handleClearFrom={handleClearFrom}
      handleClearTo={handleClearTo}
      handleClearDate={handleClearDate}
      handleSelectStation={handleSelectStation}
      handleDayPress={handleDayPress}
      onSelectTrip={onSelectTrip}
      formatDateForPill={formatDateForPill}
      hapticSuccess={hapticSuccess}
    />
  );
}

export const createStyles = (colors: ColorPalette) => StyleSheet.create(withTextShadow({
  container: {
    flex: 1,
  },
  // Original search bar style (before first station selected)
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  fullSearchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    color: colors.primary,
    fontSize: FontSizes.searchLabel,
  },
  // Segment row (after first selection)
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 6,
  },
  segmentText: {
    color: colors.primary,
    fontSize: FontSizes.searchLabel,
    fontWeight: '600',
    flexShrink: 1,
  },
  segmentInput: {
    flex: 1,
    paddingVertical: 0,
  },
  segmentTextInput: {
    color: colors.primary,
    fontSize: FontSizes.searchLabel,
    flex: 1,
    paddingVertical: Spacing.md,
  },
  segmentDate: {
    flex: 1,
  },
  segmentDatePlaceholder: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderStyle: 'dashed' as const,
  },
  resultsContainer: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: FontSizes.timeLabel,
    color: colors.secondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  noResults: {
    color: colors.secondary,
    fontSize: FontSizes.trainDate,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  stationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  stationIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    fontSize: FontSizes.searchLabel,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  stationCode: {
    fontSize: FontSizes.daysLabel,
    color: colors.secondary,
  },
  liveIndicator: {
    fontSize: FontSizes.daysLabel,
    color: '#34C759',
    fontWeight: '600',
  },
  liveFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.secondary + '40',
  },
  liveFilterBadgeActive: {
    backgroundColor: '#34C75920',
    borderColor: '#34C759',
  },
  liveFilterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  liveFilterDotActive: {
    backgroundColor: '#34C759',
  },
  liveFilterText: {
    fontSize: FontSizes.daysLabel,
    color: colors.secondary,
    fontWeight: '600',
  },
  liveFilterTextActive: {
    color: '#34C759',
  },
  datePickerContainer: {
    flex: 1,
  },
  datePickerWrapper: {
    backgroundColor: colors.background.tertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    overflow: 'hidden' as const,
  },
  tripCard: {
  },
  tripCardSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.primary,
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  hintText: {
    color: colors.secondary,
    fontSize: FontSizes.trainDate,
  },
  // Train-number flow: stop list styles
  stopItem: {
    position: 'relative' as const,
  },
  stopItemDimmed: {
    opacity: 0.4,
  },
  stopConnectorTop: {
    position: 'absolute' as const,
    left: Spacing.md + 11, // paddingHorizontal + half of marker width
    top: 0,
    width: 2,
    height: 12,
    backgroundColor: colors.border.secondary,
  },
  stopConnectorBottom: {
    position: 'absolute' as const,
    left: Spacing.md + 11,
    top: 12 + 24, // top connector height + marker height area
    bottom: 0,
    width: 2,
    backgroundColor: colors.border.secondary,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  stopMarker: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.secondary,
    backgroundColor: 'transparent',
  },
  stopDotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stopInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  stopName: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '500',
    marginBottom: 2,
  },
  stopTime: {
    fontSize: FontSizes.daysLabel,
    color: colors.secondary,
  },
  stopCode: {
    fontSize: FontSizes.daysLabel,
    color: colors.secondary,
    fontWeight: '500',
    marginTop: 4,
  },
  stopTextDimmed: {
    color: colors.secondary,
    opacity: 0.6,
  },
}, colors.textShadow));
