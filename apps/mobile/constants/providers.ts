export type ProviderId =
  | 'amtrak'
  | 'brightline'
  | 'cta'
  | 'metra'
  | 'metrotransit'
  | 'trirail';

export interface Provider {
  id: ProviderId;
  displayName: string;
  routeMinZoom: number;
  stationMinZoom: number;
  stationLabelMinZoom: number;
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'amtrak',
    displayName: 'Amtrak',
    routeMinZoom: 3,
    stationMinZoom: 5,
    stationLabelMinZoom: 8,
  },
  {
    id: 'brightline',
    displayName: 'Brightline',
    routeMinZoom: 6,
    stationMinZoom: 7,
    stationLabelMinZoom: 9,
  },
  {
    id: 'cta',
    displayName: 'CTA',
    routeMinZoom: 9,
    stationMinZoom: 10,
    stationLabelMinZoom: 12,
  },
  {
    id: 'metra',
    displayName: 'Metra',
    routeMinZoom: 8,
    stationMinZoom: 9,
    stationLabelMinZoom: 11,
  },
  {
    id: 'metrotransit',
    displayName: 'Metro Transit',
    routeMinZoom: 9,
    stationMinZoom: 10,
    stationLabelMinZoom: 12,
  },
  {
    id: 'trirail',
    displayName: 'Tri-Rail',
    routeMinZoom: 7,
    stationMinZoom: 8,
    stationLabelMinZoom: 10,
  },
];
