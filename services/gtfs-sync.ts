/**
 * GTFS weekly sync service
 * - Checks freshness (7 days)
 * - Fetches GTFS.zip from Amtrak
 * - Unzips in memory (fflate) and parses CSVs
 * - Caches parsed JSON in AsyncStorage
 * - Applies cached data to the GTFS parser
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { strFromU8, unzipSync } from 'fflate';
import type { CalendarDateException, CalendarEntry, Route, Shape, Stop, StopTime, Trip } from '../types/train';
import { gtfsParser } from '../utils/gtfs-parser';
import { shapeLoader } from './shape-loader';
import { logger } from '../utils/logger';

const GTFS_URL = 'https://content.amtrak.com/content/gtfs/GTFS.zip';
const GTFS_FILES = {
  routes: 'routes.json',
  stops: 'stops.json',
  stopTimes: 'stop_times.json',
  shapes: 'shapes.json',
  trips: 'trips.json',
  calendar: 'calendar.json',
  calendarDates: 'calendar_dates.json',
};

const STORAGE_KEYS = {
  LAST_FETCH: 'GTFS_LAST_FETCH',
  ROUTES: 'GTFS_ROUTES_JSON',
  STOPS: 'GTFS_STOPS_JSON',
  STOP_TIMES: 'GTFS_STOP_TIMES_JSON',
  SHAPES: 'GTFS_SHAPES_JSON',
  TRIPS: 'GTFS_TRIPS_JSON',
  CALENDAR: 'GTFS_CALENDAR_JSON',
  CALENDAR_DATES: 'GTFS_CALENDAR_DATES_JSON',
};

function isOlderThanDays(dateMs: number, days: number): boolean {
  const now = Date.now();
  const ms = days * 24 * 60 * 60 * 1000;
  return now - dateMs > ms;
}

function safeJSONParse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// No-op: Directory.exists is not available in this environment; rely on AsyncStorage for cache
async function ensureCacheDir() {
  // No directory check needed; cache is in AsyncStorage
}

async function readJSONFromFile<T>(filename: string): Promise<T | null> {
  // Use AsyncStorage for cache
  try {
    let key;
    if (filename === 'routes.json') key = STORAGE_KEYS.ROUTES;
    else if (filename === 'stops.json') key = STORAGE_KEYS.STOPS;
    else if (filename === 'stop_times.json') key = STORAGE_KEYS.STOP_TIMES;
    else if (filename === 'shapes.json') key = STORAGE_KEYS.SHAPES;
    else if (filename === 'trips.json') key = STORAGE_KEYS.TRIPS;
    else if (filename === 'calendar.json') key = STORAGE_KEYS.CALENDAR;
    else if (filename === 'calendar_dates.json') key = STORAGE_KEYS.CALENDAR_DATES;
    else return null;
    const content = await AsyncStorage.getItem(key);
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// Basic CSV parser that respects quoted fields
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCSVLine(lines[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  // Trim outer quotes
  return result.map(v => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v));
}

async function fetchZipBytes(): Promise<Uint8Array> {
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function buildRoutes(rows: Array<Record<string, string>>): Route[] {
  return rows
    .map(r => ({
      route_id: r['route_id'],
      agency_id: r['agency_id'] || undefined,
      route_short_name: r['route_short_name'] || undefined,
      route_long_name: r['route_long_name'] || r['route_short_name'] || r['route_id'],
      route_type: r['route_type'] || undefined,
      route_url: r['route_url'] || undefined,
      route_color: r['route_color'] || undefined,
      route_text_color: r['route_text_color'] || undefined,
    }))
    .filter(r => !!r.route_id);
}

function buildStops(rows: Array<Record<string, string>>): Stop[] {
  return rows
    .map(r => ({
      stop_id: r['stop_id'],
      stop_name: r['stop_name'],
      stop_url: r['stop_url'] || undefined,
      stop_timezone: r['stop_timezone'] || undefined,
      stop_lat: parseFloat(r['stop_lat']),
      stop_lon: parseFloat(r['stop_lon']),
    }))
    .filter(s => !!s.stop_id && !!s.stop_name);
}

function buildStopTimes(rows: Array<Record<string, string>>): Record<string, StopTime[]> {
  const grouped: Record<string, StopTime[]> = {};
  for (const r of rows) {
    const trip_id = r['trip_id'];
    if (!trip_id) continue;
    const st: StopTime = {
      trip_id,
      arrival_time: r['arrival_time'],
      departure_time: r['departure_time'],
      stop_id: r['stop_id'],
      stop_sequence: parseInt(r['stop_sequence'] || '0', 10),
      pickup_type: r['pickup_type'] ? parseInt(r['pickup_type'], 10) : undefined,
      drop_off_type: r['drop_off_type'] ? parseInt(r['drop_off_type'], 10) : undefined,
      timepoint: r['timepoint'] ? parseInt(r['timepoint'], 10) : undefined,
    };
    if (!grouped[trip_id]) grouped[trip_id] = [];
    grouped[trip_id].push(st);
  }
  // sort sequences per trip
  Object.values(grouped).forEach(arr => arr.sort((a, b) => a.stop_sequence - b.stop_sequence));
  return grouped;
}

function buildShapes(rows: Array<Record<string, string>>): Record<string, Shape[]> {
  const grouped: Record<string, Shape[]> = {};
  for (const r of rows) {
    const shape_id = r['shape_id'];
    if (!shape_id) continue;
    const shape: Shape = {
      shape_id,
      shape_pt_lat: parseFloat(r['shape_pt_lat']),
      shape_pt_lon: parseFloat(r['shape_pt_lon']),
      shape_pt_sequence: parseInt(r['shape_pt_sequence'] || '0', 10),
    };
    if (!grouped[shape_id]) grouped[shape_id] = [];
    grouped[shape_id].push(shape);
  }
  // sort by sequence
  Object.values(grouped).forEach(arr => arr.sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence));
  return grouped;
}

function buildTrips(rows: Array<Record<string, string>>): Trip[] {
  return rows
    .map(r => ({
      route_id: r['route_id'],
      trip_id: r['trip_id'],
      trip_short_name: r['trip_short_name'] || undefined,
      trip_headsign: r['trip_headsign'] || undefined,
      service_id: r['service_id'] || '',
    }))
    .filter(t => !!t.trip_id);
}

function buildCalendar(rows: Array<Record<string, string>>): CalendarEntry[] {
  return rows
    .map(r => ({
      service_id: r['service_id'],
      monday: r['monday'] === '1',
      tuesday: r['tuesday'] === '1',
      wednesday: r['wednesday'] === '1',
      thursday: r['thursday'] === '1',
      friday: r['friday'] === '1',
      saturday: r['saturday'] === '1',
      sunday: r['sunday'] === '1',
      start_date: parseInt(r['start_date'] || '0', 10),
      end_date: parseInt(r['end_date'] || '0', 10),
    }))
    .filter(c => !!c.service_id);
}

function buildCalendarDates(rows: Array<Record<string, string>>): CalendarDateException[] {
  return rows
    .map(r => ({
      service_id: r['service_id'],
      date: parseInt(r['date'] || '0', 10),
      exception_type: parseInt(r['exception_type'] || '0', 10),
    }))
    .filter(c => !!c.service_id && c.date > 0);
}

type ProgressUpdate = { step: string; progress: number; detail?: string };

export async function ensureFreshGTFS(onProgress?: (update: ProgressUpdate) => void): Promise<{ usedCache: boolean }> {
  try {
    const report = async (step: string, progress: number, detail?: string) => {
      onProgress?.({ step, progress: Math.min(1, Math.max(0, progress)), detail });
      // Progressive console logging
      if (detail) {
        logger.info(`[GTFS Refresh] ${step} (${Math.round(progress * 100)}%): ${detail}`);
      } else {
        logger.info(`[GTFS Refresh] ${step} (${Math.round(progress * 100)}%)`);
      }
      // Yield to the event loop so React can flush state updates and re-render
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    await report('Checking GTFS cache', 0.05);

    await ensureCacheDir();

    const lastFetchStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_FETCH);
    const lastFetchMs = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;

    // If cache is fresh, apply and return
    if (lastFetchMs && !isOlderThanDays(lastFetchMs, 7)) {
      const routes = await readJSONFromFile<Route[]>(GTFS_FILES.routes);
      const stops = await readJSONFromFile<Stop[]>(GTFS_FILES.stops);
      const stopTimes = await readJSONFromFile<Record<string, StopTime[]>>(GTFS_FILES.stopTimes);
      const shapes = await readJSONFromFile<Record<string, Shape[]>>(GTFS_FILES.shapes);
      const trips = await readJSONFromFile<Trip[]>(GTFS_FILES.trips);
      const calendar = await readJSONFromFile<CalendarEntry[]>(GTFS_FILES.calendar);
      const calendarDates = await readJSONFromFile<CalendarDateException[]>(GTFS_FILES.calendarDates);
      if (routes && stops && stopTimes) {
        gtfsParser.overrideData(routes, stops, stopTimes, shapes || {}, trips || [], calendar || [], calendarDates || []);

        // Initialize shape loader for map rendering
        shapeLoader.initialize(shapes || {});

        await report('Using cached GTFS', 1, 'Cache age < 7 days');
        return { usedCache: true };
      }
    }

    await report('GTFS.zip', 0.1, 'Fetching latest schedule');
    // Fetch and rebuild cache
    const zipBytes = await fetchZipBytes();
    await report('Download complete', 0.2);
    const files = unzipSync(zipBytes);
    await report('Unzipping archive', 0.3);

    const routesTxt = files['routes.txt'] ? strFromU8(files['routes.txt']) : '';
    const stopsTxt = files['stops.txt'] ? strFromU8(files['stops.txt']) : '';
    const stopTimesTxt = files['stop_times.txt'] ? strFromU8(files['stop_times.txt']) : '';
    const shapesTxt = files['shapes.txt'] ? strFromU8(files['shapes.txt']) : '';
    const tripsTxt = files['trips.txt'] ? strFromU8(files['trips.txt']) : '';
    const calendarTxt = files['calendar.txt'] ? strFromU8(files['calendar.txt']) : '';
    const calendarDatesTxt = files['calendar_dates.txt'] ? strFromU8(files['calendar_dates.txt']) : '';

    if (!routesTxt || !stopsTxt || !stopTimesTxt) {
      logger.error('[GTFS Refresh] Missing expected GTFS files (routes/stops/stop_times)');
      throw new Error('Missing expected GTFS files (routes/stops/stop_times)');
    }

    await report('Parsing routes', 0.35);
    const routes = buildRoutes(parseCSV(routesTxt));
    await report('Parsing stops', 0.45);
    const stops = buildStops(parseCSV(stopsTxt));
    await report('Parsing trips', 0.55);
    const trips = tripsTxt ? buildTrips(parseCSV(tripsTxt)) : [];
    await report('Parsing stop times', 0.7);
    const stopTimes = buildStopTimes(parseCSV(stopTimesTxt));
    await report('Parsing shapes', 0.75);
    const shapes = shapesTxt ? buildShapes(parseCSV(shapesTxt)) : {};
    await report('Parsing calendar', 0.8);
    const calendar = calendarTxt ? buildCalendar(parseCSV(calendarTxt)) : [];
    const calendarDates = calendarDatesTxt ? buildCalendarDates(parseCSV(calendarDatesTxt)) : [];

    await report('Persisting cache', 0.9, 'Writing JSON to device storage');

    // Write to AsyncStorage instead of file system
    await AsyncStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
    await AsyncStorage.setItem(STORAGE_KEYS.STOPS, JSON.stringify(stops));
    await AsyncStorage.setItem(STORAGE_KEYS.STOP_TIMES, JSON.stringify(stopTimes));
    await AsyncStorage.setItem(STORAGE_KEYS.SHAPES, JSON.stringify(shapes));
    await AsyncStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
    await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR, JSON.stringify(calendar));
    await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_DATES, JSON.stringify(calendarDates));
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_FETCH, String(Date.now()));

    gtfsParser.overrideData(routes, stops, stopTimes, shapes, trips, calendar, calendarDates);

    // Initialize shape loader for map rendering
    shapeLoader.initialize(shapes);

    await report('Refresh complete', 1, 'Applied latest GTFS');
    return { usedCache: false };
  } catch (err) {
    logger.error('[GTFS Refresh] GTFS sync failed:', err);
    onProgress?.({ step: 'GTFS refresh failed', progress: 1, detail: 'Check network connection' });
    return { usedCache: true };
  }
}

export async function hasCachedGTFS(): Promise<boolean> {
  const routes = await AsyncStorage.getItem(STORAGE_KEYS.ROUTES);
  const stops = await AsyncStorage.getItem(STORAGE_KEYS.STOPS);
  const stopTimes = await AsyncStorage.getItem(STORAGE_KEYS.STOP_TIMES);
  return !!(routes && stops && stopTimes);
}

export async function isCacheStale(): Promise<boolean> {
  const lastFetchStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_FETCH);
  const lastFetchMs = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;
  return !lastFetchMs || isOlderThanDays(lastFetchMs, 7);
}

/**
 * Load cached GTFS data into the parser (called on app startup)
 * This doesn't check staleness - just loads whatever is cached
 */
export async function loadCachedGTFS(): Promise<boolean> {
  try {
    const routes = await readJSONFromFile<Route[]>(GTFS_FILES.routes);
    const stops = await readJSONFromFile<Stop[]>(GTFS_FILES.stops);
    const stopTimes = await readJSONFromFile<Record<string, StopTime[]>>(GTFS_FILES.stopTimes);
    const shapes = await readJSONFromFile<Record<string, Shape[]>>(GTFS_FILES.shapes);
    const trips = await readJSONFromFile<Trip[]>(GTFS_FILES.trips);
    const calendar = await readJSONFromFile<CalendarEntry[]>(GTFS_FILES.calendar);
    const calendarDates = await readJSONFromFile<CalendarDateException[]>(GTFS_FILES.calendarDates);

    if (routes && stops && stopTimes) {
      gtfsParser.overrideData(routes, stops, stopTimes, shapes || {}, trips || [], calendar || [], calendarDates || []);
      shapeLoader.initialize(shapes || {});
      logger.info('[GTFS] Loaded cached data on startup');
      return true;
    }
    logger.info('[GTFS] No cached data found');
    return false;
  } catch (error) {
    logger.error('[GTFS] Failed to load cached data:', error);
    return false;
  }
}
