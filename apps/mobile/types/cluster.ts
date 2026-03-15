import type { Train } from './train';

/** A station entry within a cluster */
export interface ClusterStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** A clustered or individual station marker */
export interface StationCluster {
  id: string;
  lat: number;
  lon: number;
  isCluster: boolean;
  stations: ClusterStation[];
}

/** A train entry within a cluster */
export interface ClusterTrainEntry {
  tripId: string;
  trainNumber: string;
  routeName: string;
  position: { lat: number; lon: number };
  isSaved?: boolean;
  savedTrain?: Train;
  originalTrain?: Train;
}

/** A clustered or individual train marker */
export interface TrainCluster {
  id: string;
  lat: number;
  lon: number;
  isCluster: boolean;
  trainNumber: string;
  routeName: string;
  isSaved: boolean;
  trains: ClusterTrainEntry[];
}
