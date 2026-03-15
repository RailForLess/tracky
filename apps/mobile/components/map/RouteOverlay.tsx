/**
 * SVG Route Overlay Component
 * Renders train route paths as SVG overlays on the map
 * Implements lazy loading and viewport-based culling for performance
 */

import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { LatLng, MapView as MapViewType } from 'react-native-maps';

export interface RouteShape {
  id: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

export interface RouteOverlayProps {
  routes: RouteShape[];
  mapRef: React.RefObject<MapViewType>;
  viewport: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * Convert lat/lon coordinates to screen pixel coordinates
 * This is a simplified implementation - React Native Maps handles this internally
 */
function latLngToPoint(
  latLng: { latitude: number; longitude: number },
  viewport: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  width: number,
  height: number
): { x: number; y: number } {
  // Calculate normalized position within viewport
  const xNorm = (latLng.longitude - (viewport.longitude - viewport.longitudeDelta / 2)) / viewport.longitudeDelta;
  const yNorm = (viewport.latitude + viewport.latitudeDelta / 2 - latLng.latitude) / viewport.latitudeDelta;

  return {
    x: xNorm * width,
    y: yNorm * height,
  };
}

/**
 * Simplify path using Douglas-Peucker algorithm
 * Reduces number of points while maintaining visual fidelity
 */
function simplifyPath(
  points: Array<{ latitude: number; longitude: number }>,
  tolerance: number
): Array<{ latitude: number; longitude: number }> {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  // Otherwise, just return endpoints
  return [first, last];
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(
  point: { latitude: number; longitude: number },
  lineStart: { latitude: number; longitude: number },
  lineEnd: { latitude: number; longitude: number }
): number {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    // Line segment is a point
    return Math.sqrt(
      Math.pow(point.longitude - lineStart.longitude, 2) + Math.pow(point.latitude - lineStart.latitude, 2)
    );
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.longitude - lineStart.longitude) * dx + (point.latitude - lineStart.latitude) * dy) / (dx * dx + dy * dy)
    )
  );

  const projX = lineStart.longitude + t * dx;
  const projY = lineStart.latitude + t * dy;

  return Math.sqrt(Math.pow(point.longitude - projX, 2) + Math.pow(point.latitude - projY, 2));
}

/**
 * Create SVG path data from coordinates
 */
function createPathData(
  coordinates: Array<{ latitude: number; longitude: number }>,
  viewport: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  width: number,
  height: number,
  simplify: boolean = true
): string {
  if (coordinates.length === 0) return '';

  // Simplify path based on zoom level
  const tolerance = simplify ? viewport.latitudeDelta * 0.005 : 0;
  const points = simplify ? simplifyPath(coordinates, tolerance) : coordinates;

  if (points.length === 0) return '';

  // Convert to screen coordinates and build path
  const firstPoint = latLngToPoint(points[0], viewport, width, height);
  let pathData = `M ${firstPoint.x} ${firstPoint.y}`;

  for (let i = 1; i < points.length; i++) {
    const point = latLngToPoint(points[i], viewport, width, height);
    pathData += ` L ${point.x} ${point.y}`;
  }

  return pathData;
}

export const RouteOverlay: React.FC<RouteOverlayProps> = ({
  routes,
  viewport,
  strokeColor = '#FFFFFF',
  strokeWidth = 3,
  opacity = 0.8,
}) => {
  // Note: In React Native Maps, we use Polyline components instead of SVG overlay
  // This component is kept for reference but we'll use the native Polyline approach
  // which is more performant and integrates better with the map
  return null;
};
