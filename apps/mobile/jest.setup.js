// Setup file for Jest
// Note: extend-expect is deprecated in @testing-library/react-native v12.4+
// Built-in matchers are now included by default

// Define global __DEV__ for React Native
global.__DEV__ = true;

// Mock Expo's Winter runtime (Expo 54+)
global.__ExpoImportMetaRegistry = new Map();

// Polyfill structuredClone for Node < 17
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = obj => JSON.parse(JSON.stringify(obj));
}

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-constants — many files reach it transitively through constants/config.ts;
// the real module pokes into native registries that don't exist in the node test env.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
    manifest: {},
    manifest2: {},
  },
}));

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock MapLibre
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    Map: props => React.createElement(View, props),
    Camera: props => React.createElement(View, props),
    UserLocation: props => React.createElement(View, props),
    GeoJSONSource: props => React.createElement(View, props),
    Layer: props => React.createElement(View, props),
    Marker: props => React.createElement(View, props),
  };
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Silence the warning: Animated: `useNativeDriver` is not supported
// Note: This mock may not work with React Native 0.81+
// jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Global test timeout
jest.setTimeout(10000);
