import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import appleLight from '../assets/apple-light-style.json';
import appleDark from '../assets/apple-dark-style.json';

/** MapLibre vector tile styles (OpenFreeMap - free, no API key required) */
export const MAP_STYLE: Record<string, StyleSpecification> = {
  standard: appleLight as StyleSpecification,
  dark: appleDark as StyleSpecification,
};
