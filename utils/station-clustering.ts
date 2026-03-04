/**
 * Station clustering utility
 * Groups nearby stations when zoomed out using a grid-based spatial hash (O(n))
 */

import { ClusteringConfig } from './clustering-config';

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface StationCluster {
  id: string;
  lat: number;
  lon: number;
  stations: Station[];
  isCluster: boolean;
}

/**
 * Grid-based spatial hash key for a coordinate.
 * Each cell is `cellSize` degrees on a side.
 */
function gridKey(lat: number, lon: number, cellSize: number): string {
  const row = Math.floor(lat / cellSize);
  const col = Math.floor(lon / cellSize);
  return `${row},${col}`;
}

/**
 * Cluster stations based on zoom level using a spatial grid.
 *
 * Algorithm: assign each station to a grid cell whose size equals the cluster
 * distance. All stations in the same cell form a cluster. This is O(n) in the
 * number of stations — no nested loops or `.filter()` over the full array.
 *
 * @param stations - Array of stations to cluster
 * @param latitudeDelta - Current map zoom level (larger = more zoomed out)
 * @returns Array of clusters or individual stations
 */
export function clusterStations(stations: Station[], latitudeDelta: number): StationCluster[] {
  // If zoomed in enough, show individual stations
  if (latitudeDelta < ClusteringConfig.stationClusterThreshold) {
    return stations.map(station => ({
      id: station.id,
      lat: station.lat,
      lon: station.lon,
      stations: [station],
      isCluster: false,
    }));
  }

  const cellSize = latitudeDelta * ClusteringConfig.clusterDistanceMultiplier;
  if (cellSize <= 0) {
    return stations.map(station => ({
      id: station.id,
      lat: station.lat,
      lon: station.lon,
      stations: [station],
      isCluster: false,
    }));
  }

  // Bucket stations into grid cells — O(n)
  const grid = new Map<string, Station[]>();
  for (const station of stations) {
    const key = gridKey(station.lat, station.lon, cellSize);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(station);
  }

  // Build clusters from buckets — O(n) total across all buckets
  const clusters: StationCluster[] = [];
  for (const bucket of grid.values()) {
    let sumLat = 0;
    let sumLon = 0;
    for (const s of bucket) {
      sumLat += s.lat;
      sumLon += s.lon;
    }
    const avgLat = sumLat / bucket.length;
    const avgLon = sumLon / bucket.length;

    clusters.push({
      id: bucket.length === 1 ? bucket[0].id : `cluster-${avgLat}-${avgLon}`,
      lat: avgLat,
      lon: avgLon,
      stations: bucket,
      isCluster: bucket.length > 1,
    });
  }

  return clusters;
}

/**
 * Get station abbreviation (first 3 letters or custom abbreviation)
 */
export function getStationAbbreviation(stationId: string, stationName: string): string {
  // Use the station code if it's short enough
  if (stationId.length <= 3) {
    return stationId.toUpperCase();
  }

  // Otherwise, take first 3 letters of the name
  const words = stationName.split(' ');
  if (words.length === 1) {
    return words[0].substring(0, 3).toUpperCase();
  }

  // For multi-word names, try to use initials
  if (words.length >= 2) {
    const initials = words
      .map(w => w[0])
      .join('')
      .substring(0, 3)
      .toUpperCase();
    if (initials.length === 3) return initials;
  }

  // Fallback to first 3 letters
  return stationName.replace(/\s/g, '').substring(0, 3).toUpperCase();
}
