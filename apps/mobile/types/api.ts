/**
 * TypeScript mirrors of the backend `spec.*` and route response types.
 * Field names match the JSON tags from apps/api (camelCase).
 *
 * Keep this file in sync with:
 *   - apps/api/spec/static.go
 *   - apps/api/spec/realtime.go
 *   - apps/api/db/static_read.go (response types: EnrichedStopTime, DepartureItem, etc.)
 *   - apps/api/ws/poller.go (RealtimeUpdate envelope)
 */

export interface ApiAgency {
  providerId: string;
  gtfsAgencyId: string;
  name: string;
  url: string;
  timezone: string;
  lang: string | null;
  phone: string | null;
  country: string;
}

export interface ApiRoute {
  providerId: string;
  routeId: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  shapeId: string | null;
}

export interface ApiStop {
  providerId: string;
  stopId: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  timezone: string | null;
  wheelchairBoarding: boolean | null;
}

export interface ApiTrip {
  providerId: string;
  tripId: string;
  routeId: string;
  serviceId: string;
  shortName: string;
  headsign: string;
  shapeId: string | null;
  directionId: number | null;
}

export interface ApiScheduledStopTime {
  providerId: string;
  tripId: string;
  stopId: string;
  stopSequence: number;
  arrivalTime: string | null;
  departureTime: string | null;
  timepoint: boolean | null;
  dropOffType: number | null;
  pickupType: number | null;
}

export interface ApiEnrichedStopTime extends ApiScheduledStopTime {
  stopName: string;
  stopCode: string;
}

export interface ApiDepartureItem extends ApiTrip {
  arrivalTime: string | null;
  departureTime: string | null;
  stopSequence: number;
}

export interface ApiConnectionItem extends ApiTrip {
  from: ApiEnrichedStopTime;
  to: ApiEnrichedStopTime;
  intermediate: ApiEnrichedStopTime[];
}

export interface ApiTrainItem {
  providerId: string;
  trainNumber: string;
  sampleHeadsign: string;
  tripCount: number;
}

export interface ApiServiceInfo {
  providerId: string;
  trainNumber: string;
  minDate: string;
  maxDate: string;
}

export type ApiSearchHitType = 'station' | 'train' | 'route';

export interface ApiSearchHit {
  type: ApiSearchHitType;
  id: string;
  name: string;
  subtitle: string;
  provider: string;
}

export interface ApiSearchResult {
  stations: ApiSearchHit[];
  trains: ApiSearchHit[];
  routes: ApiSearchHit[];
}

export type VehicleStopStatus = 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';

export interface ApiTrainPosition {
  provider: string;
  tripId: string;
  runDate: string;
  trainNumber: string;
  routeId: string;
  vehicleId: string;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speedMph: number | null;
  currentStopCode: string | null;
  currentStatus: VehicleStopStatus | null;
  lastUpdated: string;
}

export interface ApiTrainStopTime {
  provider: string;
  tripId: string;
  runDate: string;
  stopCode: string;
  stopSequence: number;
  scheduledArr: string | null;
  scheduledDep: string | null;
  estimatedArr: string | null;
  estimatedDep: string | null;
  actualArr: string | null;
  actualDep: string | null;
  lastUpdated: string;
}

export interface RealtimeUpdate {
  type: 'realtime_update';
  provider: string;
  positions: ApiTrainPosition[];
}
