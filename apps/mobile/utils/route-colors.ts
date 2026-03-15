/**
 * Route color utilities for train route visualization
 * Provides color coding based on route type and characteristics
 */

export interface RouteColorScheme {
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/**
 * Get color for a route based on its ID or characteristics
 * Uses the provided color (theme-aware) for consistency
 */
export function getRouteColor(shapeId: string, color: string = '#FFFFFF'): RouteColorScheme {
  return {
    stroke: color,
    strokeWidth: 2,
    opacity: 1,
  };
}

/**
 * Get stroke width based on zoom level
 * Always returns 2px for consistent styling
 */
export function getStrokeWidthForZoom(latitudeDelta: number): number {
  return 2;
}
