import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setEnabled } from '../utils/haptics';

const STORAGE_KEY = 'hapticsEnabled';

interface HapticsContextType {
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
}

const HapticsContext = createContext<HapticsContextType | undefined>(undefined);

export const useHaptics = () => {
  const ctx = useContext(HapticsContext);
  if (!ctx) throw new Error('useHaptics must be used within HapticsProvider');
  return ctx;
};

export const HapticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw !== null) {
        const enabled = raw !== 'false';
        setHapticsEnabledState(enabled);
        setEnabled(enabled);
      }
    });
  }, []);

  const setHapticsEnabled = useCallback((enabled: boolean) => {
    setHapticsEnabledState(enabled);
    setEnabled(enabled);
    AsyncStorage.setItem(STORAGE_KEY, String(enabled));
  }, []);

  const value = useMemo(
    () => ({ hapticsEnabled, setHapticsEnabled }),
    [hapticsEnabled, setHapticsEnabled]
  );

  return (
    <HapticsContext.Provider value={value}>
      {children}
    </HapticsContext.Provider>
  );
};
