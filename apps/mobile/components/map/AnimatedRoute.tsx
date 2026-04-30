import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface AnimatedRouteProps {
  id: string;
  coordinates: Coordinate[];
  strokeColor: string;
  strokeWidth: number;
  zoomOpacity?: number;
}

export const AnimatedRoute = React.memo(function AnimatedRoute({ id, coordinates, strokeColor, strokeWidth }: AnimatedRouteProps) {
  const geoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coordinates.map(c => [c.longitude, c.latitude]),
    },
    properties: {},
  };

  return (
    <GeoJSONSource id={`route-src-${id}`} data={geoJSON}>
      <Layer
        id={`route-line-${id}`}
        type="line"
        style={{
          lineColor: strokeColor,
          lineWidth: strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </GeoJSONSource>
  );
});
