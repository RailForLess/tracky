/** Map-related constants used across MapScreen and modals */

/** Default zoom level when focusing on a train or station */
export const FOCUS_LATITUDE_DELTA = 0.05;
export const FOCUS_LONGITUDE_DELTA = 0.05;

/** Map animation duration in ms */
export const MAP_ANIMATION_DURATION = 500;

/** Fallback location (San Francisco) when location permission is denied */
export const FALLBACK_LOCATION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

/** Initial region deltas */
export const INITIAL_REGION_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

/**
 * Latitude offset multipliers for map centering based on modal state.
 * When modal is at half, the bottom 50% of the screen is covered,
 * so we offset the center point upward.
 */
export const MODAL_OFFSET = {
  half: 0.4,
  min: 0.2,
} as const;

/** Grace period (ms) after arrival before auto-archiving a trip */
export const POST_ARRIVAL_GRACE_MS = 10 * 60 * 1000; // 10 minutes

/** Viewport debounce delay (ms) for region change events */
export const VIEWPORT_DEBOUNCE_MS = 200;

/** Edge padding for fitToCoordinates calls */
export const FIT_TO_COORDINATES_PADDING = {
  standard: { top: 100, right: 60, bottom: 200, left: 60 },
  travel: { top: 100, right: 60, bottom: 400, left: 60 },
};

/** Android stagger delay (ms) for map children swap to avoid crash */
export const ANDROID_STAGGER_DELAY = 100;

/** Loading overlay fade duration (ms) */
export const LOADING_FADE_DURATION = 400;

/** Quick swipe velocity threshold for snap detection */
export const QUICK_SWIPE_VELOCITY = 1000;
