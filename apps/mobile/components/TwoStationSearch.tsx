import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, StyleSheet, TextInput } from 'react-native';
import { type ColorPalette, BorderRadius, FontSizes, Spacing, withTextShadow } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { light as hapticLight, selection as hapticSelection, success as hapticSuccess } from '../utils/haptics';
import {
  getActiveTrains,
  getConnections,
  getRoute,
  getRoutes,
  getRunStops,
  getTrainService,
  getTrainsForRoute,
  getTripStops,
  lookupTrips,
  search as apiSearch,
} from '../services/api-client';
import { TrainStorageService } from '../services/storage';
import type {
  ApiConnectionItem,
  ApiEnrichedStopTime,
  ApiRoute,
  ApiSearchHit,
  ApiTrainItem,
} from '../types/api';
import type { EnrichedStopTime, Route, SearchResult, Stop, Trip } from '../types/train';
import { useTrainContext } from '../context/TrainContext';
import { SlideUpModalContext } from './ui/SlideUpModal';
import { useApiCacheVersion } from '../hooks/useApiCache';
import { lookupAgencyTimezone, lookupStop } from '../utils/api-stop-cache';
import { logger } from '../utils/logger';
import { LocationSuggestionsService } from '../services/location-suggestions';
import { pluralCount } from '../utils/train-display';
import { formatDateForDisplay } from '../utils/date-helpers';
import type { DateData } from 'react-native-calendars';

const PROVIDER_ID = 'amtrak';

function bareCode(namespacedId: string): string {
  const i = namespacedId.indexOf(':');
  return i > 0 ? namespacedId.slice(i + 1) : namespacedId;
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function computeDelayMinutes(
  scheduledIso: string | null | undefined,
  liveIso: string | null | undefined,
): number | null {
  if (!scheduledIso || !liveIso) return null;
  const a = Date.parse(scheduledIso);
  const b = Date.parse(liveIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 60000);
}

function apiRouteToLegacy(r: ApiRoute): Route {
  return {
    route_id: r.routeId,
    route_long_name: r.longName,
    route_short_name: r.shortName,
    route_color: r.color,
    route_text_color: r.textColor,
  };
}

function apiEnrichedStopTimeToLegacy(s: ApiEnrichedStopTime): EnrichedStopTime {
  return {
    trip_id: s.tripId,
    arrival_time: s.arrivalTime ?? '',
    departure_time: s.departureTime ?? '',
    stop_id: s.stopId,
    stop_sequence: s.stopSequence,
    stop_name: s.stopName,
    stop_code: s.stopCode,
    pickup_type: s.pickupType ?? undefined,
    drop_off_type: s.dropOffType ?? undefined,
    timepoint: s.timepoint == null ? undefined : (s.timepoint ? 1 : 0),
  };
}

function apiConnectionToTripResult(c: ApiConnectionItem): TripResult {
  return {
    tripId: c.tripId,
    fromStop: apiEnrichedStopTimeToLegacy(c.from),
    toStop: apiEnrichedStopTimeToLegacy(c.to),
    intermediateStops: c.intermediate.map(apiEnrichedStopTimeToLegacy),
  };
}

function apiTrainItemToRouteTrainItem(t: ApiTrainItem): RouteTrainItem {
  return {
    trainNumber: t.trainNumber,
    displayName: t.trainNumber,
    headsign: t.sampleHeadsign,
    endpointLabel: '',
  };
}

function stationHitToStop(hit: ApiSearchHit): Stop {
  const code = bareCode(hit.id);
  const cached = lookupStop(code);
  if (cached) return cached;
  // Synthetic placeholder; downstream code only reads stop_id/stop_name, and
  // lookupStop will surface the real coords once the cache fills.
  return {
    stop_id: code,
    stop_name: hit.name,
    stop_lat: 0,
    stop_lon: 0,
  };
}

function searchHitToResult(hit: ApiSearchHit): SearchResult {
  if (hit.type === 'station') {
    return {
      id: hit.id,
      name: hit.name,
      subtitle: hit.subtitle,
      type: 'station',
      data: stationHitToStop(hit),
    };
  }
  if (hit.type === 'route') {
    const code = bareCode(hit.id);
    return {
      id: hit.id,
      name: hit.name,
      subtitle: hit.subtitle,
      type: 'route',
      data: {
        route_id: hit.id,
        route_long_name: hit.name,
        route_short_name: code,
      } as Route,
    };
  }
  // train
  return {
    id: hit.id,
    name: hit.name,
    subtitle: hit.subtitle,
    type: 'train',
    data: {
      trip_id: hit.id,
      trip_short_name: bareCode(hit.id),
      route_id: '',
      service_id: '',
    } as Trip,
  };
}

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

  const tz = lookupAgencyTimezone();
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
  const searchInputRef = useRef<TextInput>(null);
  // Subscribe to api-client cache so synthetic Stop placeholders re-resolve to
  // real coords once a fetch lands.
  useApiCacheVersion();

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
    let cancelled = false;

    // Popular (always shown)
    (async () => {
      try {
        const allRoutes = await getRoutes(PROVIDER_ID);
        if (cancelled) return;
        const popular: SuggestionItem[] = [];
        const ner = allRoutes.find(r => r.longName.toLowerCase().includes('northeast regional'));
        if (ner) popular.push({ type: 'route', label: 'Northeast Regional', subtitle: 'Route', routeId: ner.routeId });
        const acela = allRoutes.find(r => r.longName.toLowerCase().includes('acela'));
        if (acela) popular.push({ type: 'route', label: 'Acela', subtitle: 'Route', routeId: acela.routeId });
        const nyp = lookupStop('NYP');
        if (nyp) popular.push({ type: 'station', label: nyp.stop_name, subtitle: 'NYP \u00B7 Station', stop: nyp });
        setPopularSuggestions(popular);
      } catch (e) {
        logger.warn('[Search] failed to load popular routes', e);
      }
    })();

    // Nearby (from location service)
    const locationSuggestions = LocationSuggestionsService.getCachedSuggestions();
    if (locationSuggestions && locationSuggestions.length > 0) {
      setNearbySuggestions(locationSuggestions);
    }

    // History
    TrainStorageService.getTripHistory().then(history => {
      if (cancelled || history.length === 0) return;
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
        stop: lookupStop(r.fromCode) || undefined,
        toStop: lookupStop(r.toCode) || undefined,
      })));
    });

    return () => { cancelled = true; };
  }, []);

  // --- Train service date range (for constraining date picker in train flow) ---
  const [trainServiceInfo, setTrainServiceInfo] = useState<{ minDate: Date; maxDate: Date } | null>(null);
  useEffect(() => {
    if (!selectedTrainNumber) {
      setTrainServiceInfo(null);
      return;
    }
    let cancelled = false;
    getTrainService(selectedTrainNumber, { provider: PROVIDER_ID })
      .then(info => {
        if (cancelled) return;
        // ApiServiceInfo has YYYY-MM-DD strings; convert to Date.
        const [yMin, mMin, dMin] = info.minDate.split('-').map(Number);
        const [yMax, mMax, dMax] = info.maxDate.split('-').map(Number);
        setTrainServiceInfo({
          minDate: new Date(yMin, mMin - 1, dMin),
          maxDate: new Date(yMax, mMax - 1, dMax),
        });
      })
      .catch(e => {
        logger.warn('[Search] failed to load train service', e);
        if (!cancelled) setTrainServiceInfo(null);
      });
    return () => { cancelled = true; };
  }, [selectedTrainNumber]);

  // Search logic -- branches based on current state
  useEffect(() => {
    if (searchQuery.length === 0) {
      setUnifiedResults({ trains: [], routes: [], stations: [] });
      setStationResults([]);
      return;
    }

    let cancelled = false;
    if (fromStation && !toStation) {
      // Station flow: picking arrival station
      apiSearch({ q: searchQuery, provider: PROVIDER_ID, types: ['station'] })
        .then(res => {
          if (cancelled) return;
          setStationResults(res.stations.map(stationHitToStop));
        })
        .catch(e => logger.warn('[Search] station search failed', e));
    } else if (!fromStation && !selectedTrainNumber && !expandedRouteTrains) {
      // Initial view: unified search (skip when filtering within a route)
      apiSearch({ q: searchQuery, provider: PROVIDER_ID })
        .then(res => {
          if (cancelled) return;
          setUnifiedResults({
            trains: res.trains.map(searchHitToResult),
            routes: res.routes.map(searchHitToResult),
            stations: res.stations.map(searchHitToResult),
          });
        })
        .catch(e => logger.warn('[Search] unified search failed', e));
    }
    return () => { cancelled = true; };
  }, [searchQuery, fromStation, toStation, selectedTrainNumber, expandedRouteTrains]);

  // Find trips when both stations AND date are selected (station flow)
  useEffect(() => {
    if (!fromStation || !toStation || !selectedDate) {
      setTripResults([]);
      setLoadingTrips(false);
      return;
    }
    setLoadingTrips(true);
    setTripResults([]);
    let cancelled = false;
    logger.info(
      `[Search] Finding trips: ${fromStation.stop_name} \u2192 ${toStation.stop_name} on ${selectedDate.toLocaleDateString()}`
    );
    getConnections({
      fromStop: fromStation.stop_id,
      toStop: toStation.stop_id,
      date: ymd(selectedDate),
    })
      .then(conns => {
        if (cancelled) return;
        logger.info(`[Search] Found ${conns.length} trips`);
        setTripResults(conns.map(apiConnectionToTripResult));
        setLoadingTrips(false);
      })
      .catch(e => {
        if (!cancelled) {
          logger.warn('[Search] connection lookup failed', e);
          setTripResults([]);
          setLoadingTrips(false);
        }
      });
    return () => { cancelled = true; };
  }, [fromStation, toStation, selectedDate]);

  // Fetch delays for today's search results \u2014 derived from /v1/runs/.../stops
  useEffect(() => {
    if (tripResults.length === 0 || !selectedDate) {
      setTripDelays(new Map());
      return;
    }
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
    const runDate = ymd(selectedDate);

    const fetchDelays = async () => {
      const delays = new Map<string, { departDelay?: number; arriveDelay?: number }>();
      await Promise.all(
        tripResults.map(async (trip) => {
          try {
            const stops = await getRunStops({
              provider: PROVIDER_ID,
              tripId: trip.tripId,
              runDate,
            });
            const fromCode = trip.fromStop.stop_code || trip.fromStop.stop_id;
            const toCode = trip.toStop.stop_code || trip.toStop.stop_id;
            const fromRow = stops.find(s => s.stopCode === fromCode);
            const toRow = stops.find(s => s.stopCode === toCode);
            const departDelay = computeDelayMinutes(fromRow?.scheduledDep, fromRow?.estimatedDep ?? fromRow?.actualDep);
            const arriveDelay = computeDelayMinutes(toRow?.scheduledArr, toRow?.estimatedArr ?? toRow?.actualArr);
            if (departDelay != null || arriveDelay != null) {
              delays.set(trip.tripId, {
                departDelay: departDelay ?? undefined,
                arriveDelay: arriveDelay ?? undefined,
              });
            }
          } catch {
            // No live data for this run yet \u2014 leave delays unset.
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
    let cancelled = false;
    (async () => {
      try {
        const trips = await lookupTrips({
          provider: PROVIDER_ID,
          trainNumber: selectedTrainNumber,
          date: ymd(selectedDate),
        });
        if (cancelled) return;
        const trip = trips[0];
        if (!trip) {
          setTrainNotRunning(true);
          setResolvedTripId(null);
          setTrainStops([]);
          return;
        }
        setTrainNotRunning(false);
        setResolvedTripId(trip.tripId);
        const stops = await getTripStops(trip.tripId);
        if (cancelled) return;
        setTrainStops(stops.map(apiEnrichedStopTimeToLegacy));
      } catch (e) {
        if (cancelled) return;
        logger.warn('[Search] failed to resolve trip', e);
        setTrainNotRunning(true);
        setResolvedTripId(null);
        setTrainStops([]);
      }
    })();
    return () => { cancelled = true; };
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

  // The picker is bounded by trainServiceInfo.{min,max}Date. We no longer
  // mark individual non-service days as disabled (the API doesn't expose a
  // per-day calendar) — selecting a non-service day surfaces the existing
  // "train not running" empty state.
  const calendarMarkedDates = useMemo(() => {
    const marks: Record<string, { selected?: boolean; selectedColor?: string }> = {};
    if (selectedDate) {
      const key = toDateString(selectedDate);
      marks[key] = { selected: true, selectedColor: '#FFFFFF' };
    }
    return marks;
  }, [selectedDate]);

  const handleDayPress = (day: DateData) => {
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

  const handleSelectRoute = async (route: Route) => {
    hapticSelection();
    try {
      const code = bareCode(route.route_id);
      const trains = (await getTrainsForRoute(PROVIDER_ID, code)).map(apiTrainItemToRouteTrainItem);
      if (trains.length === 1) {
        handleSelectTrain(trains[0].trainNumber, trains[0].displayName);
        return;
      }
      setExpandedRouteTrains(trains);
      setExpandedRouteName(route.route_long_name);
      setSearchQuery('');
      // Fetch live train numbers for status indicators
      getActiveTrains(PROVIDER_ID)
        .then(active => setLiveTrainNumbers(new Set(active.map(t => t.trainNumber))))
        .catch(e => logger.warn('Failed to fetch active trains', e));
    } catch (e) {
      logger.warn('[Search] failed to load route trains', e);
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
        isDataLoaded={true}
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
          const from = lookupStop(todayTrain.fromCode);
          const to = lookupStop(todayTrain.toCode);
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
            const code = bareCode(suggestion.routeId);
            getRoute(PROVIDER_ID, code)
              .then(r => handleSelectRoute(apiRouteToLegacy(r)))
              .catch(e => logger.warn('Failed to load route', e));
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
      isDataLoaded={true}
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
