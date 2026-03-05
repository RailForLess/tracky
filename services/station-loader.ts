/**
 * Station Loader Service
 * Manages efficient lazy-loading of station markers based on viewport
 * Uses spatial indexing for fast viewport-based queries
 */

import type { Stop, ViewportBounds } from '../types/train';
import { info } from '../utils/logger';

export interface StationBounds {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface VisibleStation extends StationBounds {}

export class StationLoader {
  private stations: Map<string, StationBounds> = new Map();

  /**
   * Initialize station loader with all stops data
   * Stores station metadata for spatial queries
   */
  initialize(stops: Stop[]): void {
    this.stations.clear();

    stops.forEach(stop => {
      this.stations.set(stop.stop_id, {
        id: stop.stop_id,
        name: stop.stop_name,
        lat: stop.stop_lat,
        lon: stop.stop_lon,
      });
    });

    info(`[StationLoader] Initialized: ${this.stations.size} stations`);
  }

  /**
   * Get stations visible in the given viewport with padding
   * Adds padding to load stations slightly outside viewport
   */
  getVisibleStations(viewport: ViewportBounds, paddingFraction: number = 0.3): VisibleStation[] {
    const latPad = (viewport.maxLat - viewport.minLat) * paddingFraction;
    const lonPad = (viewport.maxLon - viewport.minLon) * paddingFraction;
    const paddedBounds = {
      minLat: viewport.minLat - latPad,
      maxLat: viewport.maxLat + latPad,
      minLon: viewport.minLon - lonPad,
      maxLon: viewport.maxLon + lonPad,
    };

    const visible: VisibleStation[] = [];

    // Query stations within padded viewport
    for (const station of this.stations.values()) {
      if (
        station.lat >= paddedBounds.minLat &&
        station.lat <= paddedBounds.maxLat &&
        station.lon >= paddedBounds.minLon &&
        station.lon <= paddedBounds.maxLon
      ) {
        visible.push(station);
      }
    }

    return visible;
  }

  /**
   * Get statistics about loaded stations
   */
  getStats() {
    return {
      totalStations: this.stations.size,
    };
  }

  /**
   * Look up a station by its stop_id / code
   */
  getStationByCode(code: string): StationBounds | undefined {
    return this.stations.get(code);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stations.clear();
  }
}

// Export singleton instance
export const stationLoader = new StationLoader();
