import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type TempUnit = 'F' | 'C';
export type DistanceUnit = 'mi' | 'km' | 'hotdogs';

interface UnitsContextType {
  tempUnit: TempUnit;
  distanceUnit: DistanceUnit;
  setTempUnit: (unit: TempUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
}

const STORAGE_KEY = 'userPreferences';

const UnitsContext = createContext<UnitsContextType | undefined>(undefined);

export const useUnits = () => {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used within UnitsProvider');
  return ctx;
};

export const UnitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tempUnit, setTempUnitState] = useState<TempUnit>('F');
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>('mi');

  // Refs to avoid stale closures in setters
  const tempRef = useRef(tempUnit);
  tempRef.current = tempUnit;
  const distRef = useRef(distanceUnit);
  distRef.current = distanceUnit;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        const prefs = JSON.parse(raw);
        if (prefs.tempUnit) setTempUnitState(prefs.tempUnit);
        if (prefs.distanceUnit) setDistanceUnitState(prefs.distanceUnit);
      } catch {}
    });
  }, []);

  const setTempUnit = useCallback((unit: TempUnit) => {
    setTempUnitState(unit);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ tempUnit: unit, distanceUnit: distRef.current }));
  }, []);

  const setDistanceUnit = useCallback((unit: DistanceUnit) => {
    setDistanceUnitState(unit);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ tempUnit: tempRef.current, distanceUnit: unit }));
  }, []);

  const value = useMemo(
    () => ({ tempUnit, distanceUnit, setTempUnit, setDistanceUnit }),
    [tempUnit, distanceUnit, setTempUnit, setDistanceUnit]
  );

  return (
    <UnitsContext.Provider value={value}>
      {children}
    </UnitsContext.Provider>
  );
};
