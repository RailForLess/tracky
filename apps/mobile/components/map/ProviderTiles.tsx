import React, { useCallback } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { Layer, VectorSource } from '@maplibre/maplibre-react-native';
import type { Provider } from '../../constants/providers';
import { config } from '../../constants/config';

export interface StationTapPayload {
  providerId: string;
  stopCode: string;
  stopId: string;
  name: string;
  lat: number;
  lon: number;
}

export interface RouteTapPayload {
  providerId: string;
  routeId: string;
  shortName?: string;
  longName?: string;
  color?: string;
}

interface ProviderTilesProps {
  provider: Provider;
  stationColor: string;
  stationStrokeColor: string;
  labelColor: string;
  labelHaloColor: string;
  onStationPress?: (payload: StationTapPayload) => void;
  onRoutePress?: (payload: RouteTapPayload) => void;
}

interface PressEventLike {
  features?: GeoJSON.Feature[];
  coordinates?: { latitude: number; longitude: number };
}

export const ProviderTiles = React.memo(function ProviderTiles({
  provider,
  stationColor,
  stationStrokeColor,
  labelColor,
  labelHaloColor,
  onStationPress,
  onRoutePress,
}: ProviderTilesProps) {
  const url = `pmtiles://${config.tilesUrl}/${provider.id}.pmtiles`;
  const sourceId = `tiles-${provider.id}`;
  const routeLayerId = `routes-${provider.id}`;
  const stationCircleLayerId = `stations-circle-${provider.id}`;
  const stationLabelLayerId = `stations-label-${provider.id}`;

  const handlePress = useCallback(
    (event: NativeSyntheticEvent<PressEventLike>) => {
      const features = event.nativeEvent?.features ?? [];
      const top = features[0];
      if (!top) return;
      const props = (top.properties ?? {}) as Record<string, unknown>;

      if (typeof props.code === 'string') {
        if (!onStationPress) return;
        const geom = top.geometry as GeoJSON.Point | undefined;
        const [lon, lat] = geom?.type === 'Point' ? geom.coordinates : [0, 0];
        onStationPress({
          providerId: typeof props.provider_id === 'string' ? props.provider_id : provider.id,
          stopCode: props.code,
          stopId: typeof props.stop_id === 'string' ? props.stop_id : `${provider.id}:${props.code}`,
          name: typeof props.name === 'string' ? props.name : '',
          lat,
          lon,
        });
        return;
      }

      if (typeof props.route_id === 'string') {
        if (!onRoutePress) return;
        onRoutePress({
          providerId: typeof props.provider_id === 'string' ? props.provider_id : provider.id,
          routeId: props.route_id,
          shortName: typeof props.short_name === 'string' ? props.short_name : undefined,
          longName: typeof props.long_name === 'string' ? props.long_name : undefined,
          color: typeof props.color === 'string' ? props.color : undefined,
        });
      }
    },
    [provider.id, onStationPress, onRoutePress],
  );

  return (
    <VectorSource id={sourceId} url={url} onPress={handlePress}>
      <Layer
        id={routeLayerId}
        type="line"
        source-layer="transit_routes"
        minzoom={provider.routeMinZoom}
        paint={{
          'line-color': ['coalesce', ['get', 'color'], '#888888'] as never,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 0.8,
            8, 2,
            12, 3.5,
            16, 6,
          ] as never,
          'line-opacity': 0.9,
        }}
        layout={{
          'line-cap': 'round',
          'line-join': 'round',
        }}
      />
      <Layer
        id={stationCircleLayerId}
        type="circle"
        source-layer="transit_stops"
        minzoom={provider.stationMinZoom}
        paint={{
          'circle-color': stationColor,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 2.5,
            10, 4,
            14, 6,
          ] as never,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': stationStrokeColor,
        }}
      />
      <Layer
        id={stationLabelLayerId}
        type="symbol"
        source-layer="transit_stops"
        minzoom={provider.stationLabelMinZoom}
        layout={{
          'text-field': ['get', 'name'] as never,
          'text-size': 11,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
          'text-max-width': 8,
        }}
        paint={{
          'text-color': labelColor,
          'text-halo-color': labelHaloColor,
          'text-halo-width': 1.4,
        }}
      />
    </VectorSource>
  );
});
