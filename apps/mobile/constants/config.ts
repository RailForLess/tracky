import Constants from 'expo-constants';

interface AppExtra {
  apiUrl?: string;
  wsUrl?: string;
  tilesUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

export const config = {
  apiUrl: extra.apiUrl ?? 'https://api.trackyapp.net',
  wsUrl: extra.wsUrl ?? 'wss://api.trackyapp.net/ws/realtime',
  tilesUrl: extra.tilesUrl ?? 'https://tiles.trytracky.com',
};
