import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { FALLBACK_LOCATION, INITIAL_REGION_DELTAS } from '../constants/map';
import { logger } from '../utils/logger';

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Manages initial map region from device location.
 * Requests permissions, gets location, and provides a region ref for MapView.
 */
export function useMapLocation() {
  const regionRef = useRef<MapRegion | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const setInitialRegion = useCallback((r: MapRegion) => {
    if (!regionRef.current) {
      regionRef.current = r;
      setMapReady(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let location = await Location.getLastKnownPositionAsync();
          if (!location) {
            location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
          }
          logger.debug(`[MapScreen] User location: ${location.coords.latitude.toFixed(3)}, ${location.coords.longitude.toFixed(3)}`);
          setInitialRegion({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            ...INITIAL_REGION_DELTAS,
          });
        } else {
          logger.info('[MapScreen] Location permission denied, using fallback');
          setInitialRegion({ ...FALLBACK_LOCATION });
        }
      } catch (error) {
        logger.error('Error getting initial location:', error);
        setInitialRegion({ ...FALLBACK_LOCATION });
      }
    })();
  }, [setInitialRegion]);

  return { regionRef, mapReady };
}
