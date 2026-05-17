/**
 * Train clustering utility
 * Groups nearby trains when zoomed out using a grid-based spatial hash (O(n))
 */

import type { Train } from '../types/train';
import { runKey } from './ids';
import { ClusteringConfig } from './clustering-config';

export interface LiveTrainData {
  tripId: string;
  /**
   * Service date for this run. Two simultaneous runs of the same trip
   * (e.g. yesterday's still en route + today's just departed) share
   * `tripId` — runDate is what disambiguates them. Accepts the same union
   * `runKey()` does: YYYY-MM-DD string, Date, or epoch millis.
   */
  runDate?: string | number | Date | null;
  trainNumber: string;
  routeName: string | null;
  position: {
    lat: number;
    lon: number;
    bearing?: number;
  };
  isSaved?: boolean;
  savedTrain?: Train;
  originalTrain?: Train;
}

export interface TrainCluster {
  id: string;
  lat: number;
  lon: number;
  trains: LiveTrainData[];
  isCluster: boolean;
  // For single train, keep original data
  trainNumber?: string;
  routeName?: string | null;
  tripId?: string;
  isSaved?: boolean;
}

/**
 * Grid-based spatial hash key for a coordinate.
 */
function gridKey(lat: number, lon: number, cellSize: number): string {
  const row = Math.floor(lat / cellSize);
  const col = Math.floor(lon / cellSize);
  return `${row},${col}`;
}

/**
 * Cluster trains based on zoom level using a spatial grid.
 *
 * O(n) — each train is bucketed into a grid cell, then clusters are built
 * from those buckets. No nested loops.
 *
 * @param trains - Array of trains to cluster
 * @param latitudeDelta - Current map zoom level (larger = more zoomed out)
 * @returns Array of clusters or individual trains
 */
export function clusterTrains(trains: LiveTrainData[], latitudeDelta: number): TrainCluster[] {
  // If zoomed in enough, show individual trains
  if (latitudeDelta < ClusteringConfig.trainClusterThreshold) {
    return trains.map(train => ({
      id: runKey(train),
      lat: train.position.lat,
      lon: train.position.lon,
      trains: [train],
      isCluster: false,
      trainNumber: train.trainNumber,
      routeName: train.routeName,
      tripId: train.tripId,
      isSaved: train.isSaved,
    }));
  }

  const cellSize = latitudeDelta * ClusteringConfig.clusterDistanceMultiplier;
  if (cellSize <= 0) {
    return trains.map(train => ({
      id: runKey(train),
      lat: train.position.lat,
      lon: train.position.lon,
      trains: [train],
      isCluster: false,
      trainNumber: train.trainNumber,
      routeName: train.routeName,
      tripId: train.tripId,
      isSaved: train.isSaved,
    }));
  }

  // Bucket trains into grid cells — O(n)
  const grid = new Map<string, LiveTrainData[]>();
  for (const train of trains) {
    const key = gridKey(train.position.lat, train.position.lon, cellSize);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(train);
  }

  // Build clusters from buckets — O(n) total
  const clusters: TrainCluster[] = [];
  for (const bucket of grid.values()) {
    let sumLat = 0;
    let sumLon = 0;
    let hasSaved = false;
    for (const t of bucket) {
      sumLat += t.position.lat;
      sumLon += t.position.lon;
      if (t.isSaved) hasSaved = true;
    }
    const avgLat = sumLat / bucket.length;
    const avgLon = sumLon / bucket.length;

    if (bucket.length === 1) {
      clusters.push({
        id: runKey(bucket[0]),
        lat: avgLat,
        lon: avgLon,
        trains: bucket,
        isCluster: false,
        trainNumber: bucket[0].trainNumber,
        routeName: bucket[0].routeName,
        tripId: bucket[0].tripId,
        isSaved: bucket[0].isSaved,
      });
    } else {
      clusters.push({
        id: `train-cluster-${avgLat}-${avgLon}`,
        lat: avgLat,
        lon: avgLon,
        trains: bucket,
        isCluster: true,
        isSaved: hasSaved,
      });
    }
  }

  return clusters;
}
