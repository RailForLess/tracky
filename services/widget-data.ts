import type { Train, CompletedTrip } from '../types/train';

export interface NextTrainWidgetData {
  hasTrains: boolean;
  trainNumber: string;
  routeName: string;
  fromCode: string;
  toCode: string;
  departTime: string;
  arriveTime: string;
  daysAway: number;
  delayMinutes: number;
  status: string;
}

export interface TravelStatsWidgetData {
  hasTrips: boolean;
  totalTrips: number;
  totalDistanceMiles: number;
  totalDurationMinutes: number;
  uniqueStations: number;
  favoriteRoute: string;
}

const EMPTY_NEXT_TRAIN: NextTrainWidgetData = {
  hasTrains: false,
  trainNumber: '',
  routeName: '',
  fromCode: '',
  toCode: '',
  departTime: '',
  arriveTime: '',
  daysAway: 0,
  delayMinutes: 0,
  status: '',
};

export interface UpcomingTrainsWidgetData {
  count: number;
  t0_trainNumber: string;
  t0_routeName: string;
  t0_fromCode: string;
  t0_toCode: string;
  t0_departTime: string;
  t0_arriveTime: string;
  t0_delayMinutes: number;
  t0_status: string;
  t1_trainNumber: string;
  t1_routeName: string;
  t1_fromCode: string;
  t1_toCode: string;
  t1_departTime: string;
  t1_arriveTime: string;
  t1_delayMinutes: number;
  t1_status: string;
  t2_trainNumber: string;
  t2_routeName: string;
  t2_fromCode: string;
  t2_toCode: string;
  t2_departTime: string;
  t2_arriveTime: string;
  t2_delayMinutes: number;
  t2_status: string;
  t3_trainNumber: string;
  t3_routeName: string;
  t3_fromCode: string;
  t3_toCode: string;
  t3_departTime: string;
  t3_arriveTime: string;
  t3_delayMinutes: number;
  t3_status: string;
  moreCount: number;
}

const EMPTY_UPCOMING: UpcomingTrainsWidgetData = {
  count: 0,
  t0_trainNumber: '', t0_routeName: '', t0_fromCode: '', t0_toCode: '', t0_departTime: '', t0_arriveTime: '', t0_delayMinutes: 0, t0_status: '',
  t1_trainNumber: '', t1_routeName: '', t1_fromCode: '', t1_toCode: '', t1_departTime: '', t1_arriveTime: '', t1_delayMinutes: 0, t1_status: '',
  t2_trainNumber: '', t2_routeName: '', t2_fromCode: '', t2_toCode: '', t2_departTime: '', t2_arriveTime: '', t2_delayMinutes: 0, t2_status: '',
  t3_trainNumber: '', t3_routeName: '', t3_fromCode: '', t3_toCode: '', t3_departTime: '', t3_arriveTime: '', t3_delayMinutes: 0, t3_status: '',
  moreCount: 0,
};

const EMPTY_STATS: TravelStatsWidgetData = {
  hasTrips: false,
  totalTrips: 0,
  totalDistanceMiles: 0,
  totalDurationMinutes: 0,
  uniqueStations: 0,
  favoriteRoute: '',
};

/**
 * Pick the nearest upcoming saved train from a list.
 * Sorts by daysAway then departTime, skipping past trains (daysAway < 0).
 */
export function selectNextTrain(trains: Train[]): NextTrainWidgetData {
  const upcoming = trains.filter(t => t.daysAway >= 0);
  if (upcoming.length === 0) return EMPTY_NEXT_TRAIN;

  upcoming.sort((a, b) => {
    if (a.daysAway !== b.daysAway) return a.daysAway - b.daysAway;
    return a.departTime.localeCompare(b.departTime);
  });

  const train = upcoming[0];
  const delay = train.realtime?.delay ?? 0;
  const status = delay > 0 ? 'delayed' : delay < 0 ? 'early' : 'on-time';

  return {
    hasTrains: true,
    trainNumber: train.trainNumber,
    routeName: train.routeName,
    fromCode: train.fromCode,
    toCode: train.toCode,
    departTime: train.departTime,
    arriveTime: train.arriveTime,
    daysAway: train.daysAway,
    delayMinutes: delay,
    status,
  };
}

/**
 * Aggregate travel stats from completed trip history.
 */
export function buildTravelStats(history: CompletedTrip[]): TravelStatsWidgetData {
  if (history.length === 0) return EMPTY_STATS;

  const stations = new Set<string>();
  const routeCounts = new Map<string, number>();
  let totalDistance = 0;
  let totalDuration = 0;

  for (const trip of history) {
    stations.add(trip.fromCode);
    stations.add(trip.toCode);

    if (trip.distance != null) totalDistance += trip.distance;
    if (trip.duration != null) totalDuration += trip.duration;

    const count = routeCounts.get(trip.routeName) ?? 0;
    routeCounts.set(trip.routeName, count + 1);
  }

  let favoriteRoute = '';
  let maxCount = 0;
  for (const [route, count] of routeCounts) {
    if (count > maxCount) {
      maxCount = count;
      favoriteRoute = route;
    }
  }

  return {
    hasTrips: true,
    totalTrips: history.length,
    totalDistanceMiles: Math.round(totalDistance),
    totalDurationMinutes: Math.round(totalDuration),
    uniqueStations: stations.size,
    favoriteRoute,
  };
}

/**
 * Select up to `limit` upcoming trains, sorted by daysAway then departTime.
 * Returns flattened t0–t3 fields for widget consumption (no .map() in widget directive).
 */
export function selectUpcomingTrains(trains: Train[], limit = 4): UpcomingTrainsWidgetData {
  const upcoming = trains.filter(t => t.daysAway >= 0);
  if (upcoming.length === 0) return EMPTY_UPCOMING;

  upcoming.sort((a, b) => {
    if (a.daysAway !== b.daysAway) return a.daysAway - b.daysAway;
    return a.departTime.localeCompare(b.departTime);
  });

  const selected = upcoming.slice(0, limit);

  function trainFields(t: Train) {
    const delay = t.realtime?.delay ?? 0;
    const status = delay > 0 ? 'delayed' : delay < 0 ? 'early' : 'on-time';
    return {
      trainNumber: t.trainNumber,
      routeName: t.routeName,
      fromCode: t.fromCode,
      toCode: t.toCode,
      departTime: t.departTime,
      arriveTime: t.arriveTime,
      delayMinutes: delay,
      status,
    };
  }

  const empty = { trainNumber: '', routeName: '', fromCode: '', toCode: '', departTime: '', arriveTime: '', delayMinutes: 0, status: '' };
  const f0 = selected[0] ? trainFields(selected[0]) : empty;
  const f1 = selected[1] ? trainFields(selected[1]) : empty;
  const f2 = selected[2] ? trainFields(selected[2]) : empty;
  const f3 = selected[3] ? trainFields(selected[3]) : empty;

  return {
    count: selected.length,
    t0_trainNumber: f0.trainNumber, t0_routeName: f0.routeName, t0_fromCode: f0.fromCode, t0_toCode: f0.toCode, t0_departTime: f0.departTime, t0_arriveTime: f0.arriveTime, t0_delayMinutes: f0.delayMinutes, t0_status: f0.status,
    t1_trainNumber: f1.trainNumber, t1_routeName: f1.routeName, t1_fromCode: f1.fromCode, t1_toCode: f1.toCode, t1_departTime: f1.departTime, t1_arriveTime: f1.arriveTime, t1_delayMinutes: f1.delayMinutes, t1_status: f1.status,
    t2_trainNumber: f2.trainNumber, t2_routeName: f2.routeName, t2_fromCode: f2.fromCode, t2_toCode: f2.toCode, t2_departTime: f2.departTime, t2_arriveTime: f2.arriveTime, t2_delayMinutes: f2.delayMinutes, t2_status: f2.status,
    t3_trainNumber: f3.trainNumber, t3_routeName: f3.routeName, t3_fromCode: f3.fromCode, t3_toCode: f3.toCode, t3_departTime: f3.departTime, t3_arriveTime: f3.arriveTime, t3_delayMinutes: f3.delayMinutes, t3_status: f3.status,
    moreCount: Math.max(0, upcoming.length - limit),
  };
}
