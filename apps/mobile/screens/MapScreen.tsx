import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AnimatedRoute } from '../components/map/AnimatedRoute';
import { AnimatedStationMarker } from '../components/map/AnimatedStationMarker';
import { LiveTrainMarker } from '../components/map/LiveTrainMarker';
import MapSettingsPill, { MapType, RouteMode, StationMode, TrainMode } from '../components/map/MapSettingsPill';
import DepartureBoardModal from '../components/ui/DepartureBoardModal';
import ProfileModal from '../components/ui/ProfileModal';
import { RefreshBubble } from '../components/ui/RefreshBubble';
import { TrainSpeedPill } from '../components/ui/TrainSpeedPill';
import SettingsModal from '../components/ui/SettingsModal';
import SlideUpModal from '../components/ui/SlideUpModal';
import TrainDetailModal from '../components/ui/TrainDetailModal';
import { darkMapStyle } from '../constants/map-styles';
import {
  ANDROID_STAGGER_DELAY,
  FIT_TO_COORDINATES_PADDING,
  FOCUS_LATITUDE_DELTA,
  FOCUS_LONGITUDE_DELTA,
  LOADING_FADE_DURATION,
  MAP_ANIMATION_DURATION,
  MODAL_OFFSET,
  VIEWPORT_DEBOUNCE_MS,
} from '../constants/map';
import { type ColorPalette, withTextShadow } from '../constants/theme';
import { useColors, useTheme } from '../context/ThemeContext';
import { GTFSRefreshProvider, useGTFSRefresh } from '../context/GTFSRefreshContext';
import { ModalProvider, useModalActions, useModalState } from '../context/ModalContext';
import { TrainProvider, useTrainContext } from '../context/TrainContext';
import { UnitsProvider } from '../context/UnitsContext';
import { useLiveTrains } from '../hooks/useLiveTrains';
import { useMapLocation } from '../hooks/useMapLocation';
import { useRealtime } from '../hooks/useRealtime';
import { useShapes } from '../hooks/useShapes';
import { useStations } from '../hooks/useStations';
import { useTravelOverlay } from '../hooks/useTravelOverlay';
import { TrainAPIService } from '../services/api';
import { requestPermissions as requestNotificationPermissions } from '../services/notifications';
import { TrainStorageService } from '../services/storage';
import type { StationCluster, TrainCluster } from '../types/cluster';
import type { SavedTrainRef, Stop, Train, ViewportBounds } from '../types/train';
import { ClusteringConfig } from '../utils/clustering-config';
import { gtfsParser } from '../utils/gtfs-parser';
import { light as hapticLight } from '../utils/haptics';
import { logger } from '../utils/logger';
import { getRouteColor, getStrokeWidthForZoom } from '../utils/route-colors';
import { clusterStations, getStationAbbreviation } from '../utils/station-clustering';
import { clusterTrains } from '../utils/train-clustering';
import { ModalContent, ModalContentHandle } from './ModalContent';
import { createStyles } from './styles';

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Convert map region to viewport bounds for lazy loading
function regionToViewportBounds(region: MapRegion): ViewportBounds {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLon: region.longitude - region.longitudeDelta / 2,
    maxLon: region.longitude + region.longitudeDelta / 2,
  };
}

/**
 * Calculate latitude offset for map centering based on modal state.
 * When modal is at 50%, center point at 20% from top (40% of visible area).
 * When no modal or fullscreen, center normally (no offset).
 */
function getLatitudeOffsetForModal(latitudeDelta: number, modalSnap: 'min' | 'half' | 'max' | null): number {
  if (modalSnap === 'half') {
    return latitudeDelta * MODAL_OFFSET.half;
  }
  if (modalSnap === 'min') {
    return latitudeDelta * MODAL_OFFSET.min;
  }
  return 0;
}

const createLoadingStyles = (colors: ColorPalette) =>
  StyleSheet.create(withTextShadow({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      elevation: 99999,
    },
    icon: {
      marginBottom: 16,
    },
    copyright: {
      position: 'absolute',
      bottom: '15%',
      color: colors.secondary,
      fontSize: 12,
      fontWeight: '400',
      opacity: 0.6,
    },
  }, colors.textShadow));

function LoadingOverlay({ visible }: { visible: boolean }) {
  const colors = useColors();
  const lStyles = useMemo(() => createLoadingStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(1)).current;
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(1);
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: LOADING_FADE_DURATION,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, opacity]);

  if (!mounted) return null;

  return (
    <Animated.View style={[lStyles.overlay, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
      <Ionicons name="train" size={128} color="rgba(255, 255, 255, 0.25)" style={lStyles.icon} />
      <Text style={lStyles.copyright}>Tracky - Made with &lt;3 by Jason</Text>
    </Animated.View>
  );
}

function MapScreenInner() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef<MapView>(null);
  const modalContentRef = useRef<ModalContentHandle>(null);
  const { triggerRefresh, isLoadingCache } = useGTFSRefresh();

  // Split modal context — actions (stable) vs state (reactive)
  const {
    mainModalRef,
    detailModalRef,
    departureBoardRef,
    profileModalRef,
    settingsModalRef,
    getCurrentSnap,
    navigateToTrain,
    navigateToStation,
    navigateToProfile,
    navigateToSettings,
    navigateToMain,
    goBack,
    handleModalDismissed,
    handleSnapChange,
    getInitialSnap,
  } = useModalActions();
  const {
    activeModal,
    showMainContent,
    showTrainDetailContent,
    showDepartureBoardContent,
    showProfileContent,
    showSettingsContent,
    modalData,
  } = useModalState();
  const isProfileActive = activeModal === 'profile';
  const isSettingsActive = activeModal === 'settings';
  // Profile and settings both swap the map to show the lightweight past-trips
  // overlay instead of all live trains, routes, and stations.
  const isOverlayMode = isProfileActive || isSettingsActive;

  // Stagger MapView children swap to avoid Android "addViewAt" crash.
  // When overlay mode changes, first remove old children, then after a
  // frame add new children — prevents simultaneous bulk add/remove.
  const [showNormalMapContent, setShowNormalMapContent] = useState(true);
  const [showProfileMapContent, setShowProfileMapContent] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') {
      setShowNormalMapContent(!isOverlayMode);
      setShowProfileMapContent(isOverlayMode);
      return;
    }
    if (isOverlayMode) {
      setShowNormalMapContent(false);
      const timer = setTimeout(() => setShowProfileMapContent(true), ANDROID_STAGGER_DELAY);
      return () => clearTimeout(timer);
    } else {
      setShowProfileMapContent(false);
      const timer = setTimeout(() => setShowNormalMapContent(true), ANDROID_STAGGER_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isOverlayMode]);

  // Map location from device — region ref for initial MapView render
  const { regionRef, mapReady } = useMapLocation();

  // Combined viewport state — single setState triggers one re-render instead of two
  const [viewportState, setViewportState] = useState<{
    bounds: ViewportBounds | null;
    latDelta: number;
  }>({ bounds: null, latDelta: 1 });
  const viewportBounds = viewportState.bounds;
  const debouncedLatDelta = viewportState.latDelta;
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [routeMode, setRouteMode] = useState<RouteMode>('visible');
  const [stationMode, setStationMode] = useState<StationMode>('auto');
  const [trainMode, setTrainMode] = useState<TrainMode>('all');
  const { savedTrains, setSavedTrains, selectedTrain, setSelectedTrain } = useTrainContext();
  const insets = useSafeAreaInsets();

  // Travel overlay for profile/settings views
  const { travelLines, travelStations, handleProfileYearChange } = useTravelOverlay(isOverlayMode);

  // Zoom to fit all travel points when overlay mode activates
  useEffect(() => {
    if (!isOverlayMode || travelStations.length === 0) return;

    const coords = travelStations.map(s => ({ latitude: s.latitude, longitude: s.longitude }));
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: FIT_TO_COORDINATES_PADDING.travel,
        animated: true,
      });
    }, MAP_ANIMATION_DURATION);

    return () => clearTimeout(timer);
  }, [isOverlayMode, travelStations]);

  // Use lazy-loaded stations and shapes based on viewport
  const stations = useStations(viewportBounds ?? undefined);
  const { visibleShapes } = useShapes(viewportBounds ?? undefined);

  // Fetch all live trains from GTFS-RT (only when trainMode is 'all')
  const { liveTrains } = useLiveTrains(15000, trainMode === 'all');

  // Find live speed/bearing for the selected train
  const selectedLiveData = useMemo(() => {
    if (!selectedTrain || !showTrainDetailContent) return null;
    const match = liveTrains.find(
      lt =>
        (selectedTrain.tripId && lt.tripId === selectedTrain.tripId) ||
        lt.trainNumber === selectedTrain.trainNumber
    );
    return match?.position ?? null;
  }, [selectedTrain, liveTrains, showTrainDetailContent]);

  // Memoize clustered trains to avoid expensive reclustering on every render
  const clusteredLiveTrains = useMemo(() => {
    if (trainMode !== 'all') return [];
    const trainsWithSavedStatus = liveTrains.map(train => {
      const savedTrain = savedTrains.find(
        saved =>
          saved.daysAway <= 0 &&
          (saved.tripId === train.tripId || saved.trainNumber === train.trainNumber)
      );
      return {
        tripId: train.tripId,
        trainNumber: train.trainNumber,
        routeName: train.routeName,
        position: train.position,
        isSaved: !!savedTrain,
        savedTrain,
      };
    });
    return clusterTrains(trainsWithSavedStatus, debouncedLatDelta);
  }, [liveTrains, savedTrains, debouncedLatDelta, trainMode]);

  const clusteredSavedTrains = useMemo(() => {
    if (trainMode !== 'saved') return [];
    const savedTrainsWithPosition = savedTrains
      .filter(train => train.realtime?.position)
      .map(train => ({
        tripId: train.tripId || `saved-${train.id}`,
        trainNumber: train.trainNumber,
        routeName: train.routeName,
        position: {
          lat: train.realtime!.position!.lat,
          lon: train.realtime!.position!.lon,
        },
        isSaved: true,
        originalTrain: train,
      }));
    return clusterTrains(savedTrainsWithPosition, debouncedLatDelta);
  }, [savedTrains, debouncedLatDelta, trainMode]);

  // Handle train selection from list - animate map if has position, navigate to detail
  const handleTrainSelect = useCallback(
    (train: Train) => {
      setSelectedTrain(train);

      // If train has realtime position, animate map to that location
      const fromMarker = !!train.realtime?.position;
      if (train.realtime?.position) {
        const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, 'half');
        mapRef.current?.animateToRegion(
          {
            latitude: train.realtime.position.lat - latitudeOffset,
            longitude: train.realtime.position.lon,
            latitudeDelta: FOCUS_LATITUDE_DELTA,
            longitudeDelta: FOCUS_LONGITUDE_DELTA,
          },
          MAP_ANIMATION_DURATION
        );
      }

      navigateToTrain(train, { fromMarker });
    },
    [setSelectedTrain, navigateToTrain]
  );

  // Handle train marker press on the map - center map on train and show detail at 50%
  const handleTrainMarkerPress = useCallback(
    (train: Train, lat: number, lon: number) => {
      hapticLight();
      const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, 'half');
      mapRef.current?.animateToRegion(
        {
          latitude: lat - latitudeOffset,
          longitude: lon,
          latitudeDelta: FOCUS_LATITUDE_DELTA,
          longitudeDelta: FOCUS_LONGITUDE_DELTA,
        },
        MAP_ANIMATION_DURATION
      );

      setSelectedTrain(train);
      navigateToTrain(train, { fromMarker: true });
    },
    [setSelectedTrain, navigateToTrain]
  );

  // Race-condition guard: only apply API result if it matches the latest request
  const latestLiveTrainRequestRef = useRef<string | null>(null);

  // Handle live train marker press - zoom immediately, show skeleton, fetch in background
  const handleLiveTrainMarkerPress = useCallback(
    (tripId: string, trainNumber: string, lat: number, lon: number, routeName?: string) => {
      hapticLight();
      const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, 'half');
      mapRef.current?.animateToRegion(
        {
          latitude: lat - latitudeOffset,
          longitude: lon,
          latitudeDelta: FOCUS_LATITUDE_DELTA,
          longitudeDelta: FOCUS_LONGITUDE_DELTA,
        },
        MAP_ANIMATION_DURATION
      );

      // Create placeholder train with available data — modal opens instantly with skeleton
      const placeholder: Train = {
        id: 0,
        operator: '',
        trainNumber,
        from: '',
        to: '',
        fromCode: '',
        toCode: '',
        departTime: '',
        arriveTime: '',
        date: '',
        daysAway: 0,
        routeName: routeName || '',
        tripId,
        realtime: { position: { lat, lon } },
      };

      latestLiveTrainRequestRef.current = tripId;
      setSelectedTrain(placeholder);
      navigateToTrain(placeholder, { fromMarker: true });

      // Fetch full details in background
      TrainAPIService.getTrainDetails(tripId, undefined, trainNumber)
        .then(train => {
          if (latestLiveTrainRequestRef.current !== tripId) return; // stale
          if (train) {
            setSelectedTrain(train);
          } else {
            goBack();
            Alert.alert('Train Unavailable', 'Could not load details for this train. It may no longer be active.');
          }
        })
        .catch(error => {
          if (latestLiveTrainRequestRef.current !== tripId) return; // stale
          logger.error('Error fetching train details:', error);
          goBack();
          Alert.alert('Connection Error', 'Could not load train details. Check your internet connection and try again.');
        });
    },
    [setSelectedTrain, navigateToTrain, goBack]
  );

  // Zoom map to fit all given coordinates in the viewport
  const fitMapToCoordinates = useCallback((coords: { latitude: number; longitude: number }[]) => {
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: FIT_TO_COORDINATES_PADDING.standard,
      animated: true,
    });
  }, []);

  // Handle station pin press - show departure board
  const handleStationPress = useCallback(
    (cluster: {
      id: string;
      lat: number;
      lon: number;
      isCluster: boolean;
      stations: Array<{ id: string; name: string; lat: number; lon: number }>;
    }) => {
      hapticLight();
      // If it's a cluster, just zoom in
      if (cluster.isCluster) {
        fitMapToCoordinates(cluster.stations.map((s) => ({
          latitude: s.lat,
          longitude: s.lon,
        })));
        return;
      }

      // Get the station data
      const stationData = cluster.stations[0];
      const stop: Stop = {
        stop_id: stationData.id,
        stop_name: stationData.name,
        stop_lat: stationData.lat,
        stop_lon: stationData.lon,
      };

      const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, 'half');
      mapRef.current?.animateToRegion(
        {
          latitude: stationData.lat - latitudeOffset,
          longitude: stationData.lon,
          latitudeDelta: FOCUS_LATITUDE_DELTA,
          longitudeDelta: FOCUS_LONGITUDE_DELTA,
        },
        MAP_ANIMATION_DURATION
      );

      navigateToStation(stop);
    },
    [navigateToStation, fitMapToCoordinates]
  );

  // Stable callback for station marker presses — receives cluster from child
  const handleStationMarkerPress = useCallback((cluster: {
    id: string;
    lat: number;
    lon: number;
    isCluster: boolean;
    stations: Array<{ id: string; name: string; lat: number; lon: number }>;
  }) => {
    handleStationPress(cluster);
  }, [handleStationPress]);

  // Stable callback for saved train cluster presses
  const handleSavedTrainClusterPress = useCallback((cluster: TrainCluster) => {
    if (cluster.isCluster) {
      fitMapToCoordinates(cluster.trains.map(t => ({
        latitude: t.position.lat,
        longitude: t.position.lon,
      })));
      return;
    }
    if (cluster.trains[0]?.originalTrain) {
      handleTrainMarkerPress(cluster.trains[0].originalTrain, cluster.lat, cluster.lon);
    }
  }, [handleTrainMarkerPress, fitMapToCoordinates]);

  // Stable callback for live train cluster presses
  const handleLiveTrainClusterPress = useCallback((cluster: TrainCluster) => {
    if (cluster.isCluster) {
      fitMapToCoordinates(cluster.trains.map(t => ({
        latitude: t.position.lat,
        longitude: t.position.lon,
      })));
      return;
    }
    if (cluster.trains[0]) {
      const trainData = cluster.trains[0];
      if (trainData.savedTrain && trainData.savedTrain.realtime?.position) {
        handleTrainMarkerPress(trainData.savedTrain, cluster.lat, cluster.lon);
      } else {
        handleLiveTrainMarkerPress(trainData.tripId, trainData.trainNumber, cluster.lat, cluster.lon, trainData.routeName || undefined);
      }
    }
  }, [handleTrainMarkerPress, handleLiveTrainMarkerPress, fitMapToCoordinates]);

  // Handle train selection from departure board
  // If train has a live position, zoom to it and open at half; otherwise open full
  const handleDepartureBoardTrainSelect = useCallback(
    (train: Train) => {
      setSelectedTrain(train);
      const hasPosition = !!train.realtime?.position;

      if (hasPosition) {
        const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, 'half');
        mapRef.current?.animateToRegion(
          {
            latitude: train.realtime!.position!.lat - latitudeOffset,
            longitude: train.realtime!.position!.lon,
            latitudeDelta: FOCUS_LATITUDE_DELTA,
            longitudeDelta: FOCUS_LONGITUDE_DELTA,
          },
          MAP_ANIMATION_DURATION
        );
      }

      navigateToTrain(train, { fromMarker: hasPosition, returnTo: 'departureBoard' });
    },
    [setSelectedTrain, navigateToTrain]
  );

  // Handle saving train from departure board tap or swipe, then navigate to train view
  const handleSaveTrainFromBoard = useCallback(
    async (train: Train, travelDate: Date): Promise<boolean> => {
      if (!train.tripId) return false;
      const ref: SavedTrainRef = {
        tripId: train.tripId,
        fromCode: train.fromCode || undefined,
        toCode: train.toCode || undefined,
        travelDate: travelDate.getTime(),
        savedAt: Date.now(),
      };
      const saved = await TrainStorageService.saveTrainRef(ref);
      if (saved) {
        const updatedTrains = await TrainStorageService.getSavedTrains();
        setSavedTrains(updatedTrains);
      }
      // Navigate to train detail view
      handleDepartureBoardTrainSelect(train);
      return saved;
    },
    [setSavedTrains, handleDepartureBoardTrainSelect]
  );

  // Handle close button on departure board
  const handleDepartureBoardClose = useCallback(() => {
    navigateToMain();
  }, [navigateToMain]);

  // Handle detail modal close
  const handleDetailModalClose = useCallback(() => {
    goBack();
  }, [goBack]);

  // Handle train-to-train navigation from detail modal
  const handleTrainToTrainNavigation = useCallback(
    (train: Train) => {
      setSelectedTrain(train);
      navigateToTrain(train, { fromMarker: false });
    },
    [setSelectedTrain, navigateToTrain]
  );

  // Handle station selection from train detail - navigate to departure board
  const handleStationSelectFromDetail = useCallback(
    (stationCode: string, lat: number, lon: number) => {
      const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, 'half');
      mapRef.current?.animateToRegion(
        {
          latitude: lat - latitudeOffset,
          longitude: lon,
          latitudeDelta: FOCUS_LATITUDE_DELTA,
          longitudeDelta: FOCUS_LONGITUDE_DELTA,
        },
        MAP_ANIMATION_DURATION
      );

      // Create a Stop object and navigate
      const stop: Stop = {
        stop_id: stationCode,
        stop_name: gtfsParser.getStopName(stationCode),
        stop_lat: lat,
        stop_lon: lon,
      };
      navigateToStation(stop);
    },
    [navigateToStation]
  );

  // Request notification permissions on mount
  React.useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // Track when GTFS data is loaded — event-based, no polling
  const [gtfsLoaded, setGtfsLoaded] = React.useState(gtfsParser.isLoaded);

  React.useEffect(() => {
    if (gtfsLoaded) return;
    return gtfsParser.onLoaded(() => {
      logger.info('[MapScreen] GTFS data ready');
      setGtfsLoaded(true);
    });
  }, [gtfsLoaded]);

  // Load saved trains after GTFS is ready
  React.useEffect(() => {
    if (!gtfsLoaded) return;

    (async () => {
      const trains = await TrainStorageService.getSavedTrains();
      logger.debug(`[MapScreen] Loading ${trains.length} saved trains with realtime data`);
      const trainsWithRealtime = await Promise.all(trains.map(train => TrainAPIService.refreshRealtimeData(train)));
      setSavedTrains(trainsWithRealtime);
    })();
  }, [setSavedTrains, gtfsLoaded]);

  useRealtime(savedTrains, setSavedTrains, 20000);

  // Handle notification taps — navigate to the train's detail modal.
  // Use a ref for savedTrains to avoid tearing down/recreating the listener every 20s.
  const savedTrainsRef = useRef(savedTrains);
  savedTrainsRef.current = savedTrains;

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (!data?.tripId) return;

      const match = savedTrainsRef.current.find(
        t =>
          t.tripId === data.tripId &&
          t.fromCode === data.fromCode &&
          t.toCode === data.toCode
      );
      if (match) {
        setSelectedTrain(match);
        navigateToTrain(match, { fromMarker: false });
      }
    });
    return () => subscription.remove();
  }, [setSelectedTrain, navigateToTrain]);

  // Handle region changes — region ref is updated immediately (no re-render),
  // viewport state is debounced to batch downstream recomputations.
  const handleRegionChangeComplete = useCallback((newRegion: MapRegion) => {
    regionRef.current = newRegion;

    // Debounce viewport bounds + latDelta together — single setState, single re-render
    if (viewportDebounceRef.current) {
      clearTimeout(viewportDebounceRef.current);
    }
    viewportDebounceRef.current = setTimeout(() => {
      setViewportState({
        bounds: regionToViewportBounds(newRegion),
        latDelta: newRegion.latitudeDelta,
      });
    }, VIEWPORT_DEBOUNCE_MS);
  }, []);

  // Initialize viewport bounds when map first becomes ready
  React.useEffect(() => {
    if (mapReady && regionRef.current && !viewportBounds) {
      setViewportState({
        bounds: regionToViewportBounds(regionRef.current),
        latDelta: regionRef.current.latitudeDelta,
      });
    }
  }, [mapReady, viewportBounds]);

  // Cleanup timers on unmount
  React.useEffect(() => {
    return () => {
      if (viewportDebounceRef.current) {
        clearTimeout(viewportDebounceRef.current);
      }
    };
  }, []);

  const handleRecenter = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      let location = await Location.getLastKnownPositionAsync();
      if (!location) {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }
      const latitudeOffset = getLatitudeOffsetForModal(FOCUS_LATITUDE_DELTA, getCurrentSnap());
      mapRef.current?.animateToRegion(
        {
          latitude: location.coords.latitude - latitudeOffset,
          longitude: location.coords.longitude,
          latitudeDelta: FOCUS_LATITUDE_DELTA,
          longitudeDelta: FOCUS_LONGITUDE_DELTA,
        },
        MAP_ANIMATION_DURATION
      );
    } catch (error) {
      logger.error('Error getting location:', error);
    }
  }, [getCurrentSnap]);

  // Calculate dynamic stroke width based on zoom level
  const baseStrokeWidth = useMemo(() => {
    return getStrokeWidthForZoom(debouncedLatDelta);
  }, [debouncedLatDelta]);

  // Routes are always visible (no zoom-based fading)
  const shouldRenderRoutes = routeMode !== 'hidden';

  // Cluster stations based on zoom level and station mode
  const stationClusters = useMemo(() => {
    if (stationMode === 'hidden') return [];
    if (stationMode === 'all') {
      // Return all stations without clustering
      return stations.map(s => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        isCluster: false,
        stations: [s],
      }));
    }
    // 'auto' mode - use clustering
    return clusterStations(stations, debouncedLatDelta);
  }, [stations, debouncedLatDelta, stationMode]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapType}
        initialRegion={regionRef.current!}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsTraffic={false}
        showsIndoors={true}
        userLocationAnnotationTitle="Your Location"
        provider={PROVIDER_DEFAULT}
        customMapStyle={isDark ? darkMapStyle : []}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {showNormalMapContent &&
          shouldRenderRoutes &&
          visibleShapes.map(shape => {
            const colorScheme = getRouteColor(shape.id, colors.accentBlue);
            return (
              <AnimatedRoute
                key={shape.id}
                id={shape.id}
                coordinates={shape.coordinates}
                strokeColor={colorScheme.stroke}
                strokeWidth={Math.max(2, baseStrokeWidth)}
              />
            );
          })}

        {showNormalMapContent &&
          stationClusters.map(cluster => {
            // Show full name when zoomed in enough
            const showFullName = !cluster.isCluster && debouncedLatDelta < ClusteringConfig.fullNameThreshold;
            const displayName = cluster.isCluster
              ? `${cluster.stations.length}+`
              : showFullName
                ? cluster.stations[0].name
                : getStationAbbreviation(cluster.stations[0].id, cluster.stations[0].name);
            return (
              <AnimatedStationMarker
                key={cluster.id}
                cluster={cluster}
                showFullName={showFullName}
                displayName={displayName}
                color={colors.accentBlue}
                onPress={handleStationMarkerPress}
              />
            );
          })}

        {/* Render saved trains when mode is 'saved' */}
        {showNormalMapContent &&
          trainMode === 'saved' &&
          clusteredSavedTrains.map(cluster => (
            <LiveTrainMarker
              key={cluster.id}
              trainNumber={cluster.trainNumber || ''}
              routeName={cluster.routeName || null}
              coordinate={{
                latitude: cluster.lat,
                longitude: cluster.lon,
              }}
              isSaved={true}
              isCluster={cluster.isCluster}
              clusterCount={cluster.trains.length}
              color={colors.accentBlue}
              onPress={() => handleSavedTrainClusterPress(cluster)}
            />
          ))}

        {/* Render all live trains when mode is 'all' */}
        {showNormalMapContent &&
          trainMode === 'all' &&
          clusteredLiveTrains.map(cluster => (
            <LiveTrainMarker
              key={cluster.id}
              trainNumber={cluster.trainNumber || ''}
              routeName={cluster.routeName || null}
              coordinate={{
                latitude: cluster.lat,
                longitude: cluster.lon,
              }}
              isSaved={cluster.isSaved}
              isCluster={cluster.isCluster}
              clusterCount={cluster.trains.length}
              color={colors.accentBlue}
              onPress={() => handleLiveTrainClusterPress(cluster)}
            />
          ))}

        {/* Travel history overlay when profile is open */}
        {showProfileMapContent &&
          travelLines.map(line => (
            <Polyline
              key={line.key}
              coordinates={[line.from, line.to]}
              strokeColor={colors.accentBlue}
              strokeWidth={2}
            />
          ))}
        {showProfileMapContent &&
          travelStations.map(station => (
            <Marker key={station.id} coordinate={station} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.accentBlue,
                }}
              />
            </Marker>
          ))}
      </MapView>

      <RefreshBubble />
      <TrainSpeedPill
        speed={selectedLiveData?.speed}
        bearing={selectedLiveData?.bearing}
        visible={!!selectedLiveData}
      />

      <MapSettingsPill
        top={insets.top + 16}
        routeMode={routeMode}
        setRouteMode={setRouteMode}
        stationMode={stationMode}
        setStationMode={setStationMode}
        mapType={mapType}
        setMapType={setMapType}
        trainMode={trainMode}
        setTrainMode={setTrainMode}
        onRecenter={handleRecenter}
      />

      {/* Main modal - always mounted, content conditional */}
      <SlideUpModal
        ref={mainModalRef}
        minSnapPercent={0.35}
        initialSnap={savedTrains.length === 0 ? 'min' : 'half'}
        onDismiss={() => handleModalDismissed('main')}
        onSnapChange={handleSnapChange}
      >
        {showMainContent && (
          <ModalContent
            ref={modalContentRef}
            onTrainSelect={train => {
              if (train) {
                handleTrainSelect(train);
              }
            }}
            onOpenProfile={() => navigateToProfile()}
          />
        )}
      </SlideUpModal>

      {/* Detail modal - always mounted, starts hidden, content conditional */}
      <SlideUpModal
        ref={detailModalRef}
        minSnapPercent={0.15}
        initialSnap={getInitialSnap('trainDetail')}
        startHidden
        onDismiss={() => handleModalDismissed('trainDetail')}
        onSnapChange={handleSnapChange}
      >
        {showTrainDetailContent && (
          <ErrorBoundary onDismiss={handleDetailModalClose}>
            <TrainDetailModal
              train={selectedTrain || modalData.train}
              onClose={handleDetailModalClose}
              onStationSelect={handleStationSelectFromDetail}
              onTrainSelect={handleTrainToTrainNavigation}
            />
          </ErrorBoundary>
        )}
      </SlideUpModal>

      {/* Departure board modal - always mounted, starts hidden, content conditional */}
      <SlideUpModal
        ref={departureBoardRef}
        minSnapPercent={0.15}
        initialSnap={getInitialSnap('departureBoard')}
        startHidden
        onDismiss={() => handleModalDismissed('departureBoard')}
        onSnapChange={handleSnapChange}
      >
        {showDepartureBoardContent && modalData.station && (
          <ErrorBoundary onDismiss={handleDepartureBoardClose}>
            <DepartureBoardModal
              station={modalData.station}
              onClose={handleDepartureBoardClose}
              onTrainSelect={handleDepartureBoardTrainSelect}
              onSaveTrain={handleSaveTrainFromBoard}
            />
          </ErrorBoundary>
        )}
      </SlideUpModal>

      {/* Profile modal - always mounted, starts hidden, content conditional */}
      <SlideUpModal
        ref={profileModalRef}
        minSnapPercent={0.50}
        initialSnap={getInitialSnap('profile')}
        startHidden
        onDismiss={() => handleModalDismissed('profile')}
        onSnapChange={handleSnapChange}
      >
        {showProfileContent && (
          <ErrorBoundary onDismiss={() => goBack()}>
            <ProfileModal
              onClose={() => goBack()}
              onOpenSettings={() => navigateToSettings()}
              onYearChange={handleProfileYearChange}
            />
          </ErrorBoundary>
        )}
      </SlideUpModal>

      {/* Settings modal - always mounted, starts hidden, content conditional */}
      <SlideUpModal
        ref={settingsModalRef}
        minSnapPercent={0.50}
        initialSnap={getInitialSnap('settings')}
        startHidden
        onDismiss={() => handleModalDismissed('settings')}
        onSnapChange={handleSnapChange}
      >
        {showSettingsContent && (
          <ErrorBoundary onDismiss={() => goBack()}>
            <SettingsModal
              onClose={() => goBack()}
              onRefreshGTFS={() => {
                triggerRefresh();
              }}
            />
          </ErrorBoundary>
        )}
      </SlideUpModal>

      {/* Full-page loading overlay while GTFS cache loads */}
      <LoadingOverlay visible={isLoadingCache} />
    </View>
  );
}

export default function MapScreen() {
  return (
    <UnitsProvider>
      <TrainProvider>
        <GTFSRefreshProvider>
          <ModalProvider>
            <ErrorBoundary>
              <MapScreenInner />
            </ErrorBoundary>
          </ModalProvider>
        </GTFSRefreshProvider>
      </TrainProvider>
    </UnitsProvider>
  );
}
