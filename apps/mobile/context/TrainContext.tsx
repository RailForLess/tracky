import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Train } from '../types/train';
import { debug } from '../utils/logger';

interface TrainContextType {
  savedTrains: Train[];
  setSavedTrains: React.Dispatch<React.SetStateAction<Train[]>>;
  selectedTrain: Train | null;
  setSelectedTrain: React.Dispatch<React.SetStateAction<Train | null>>;
}

export const TrainContext = createContext<TrainContextType | undefined>(undefined);

export const useTrainContext = () => {
  const ctx = useContext(TrainContext);
  if (!ctx) throw new Error('useTrainContext must be used within TrainProvider');
  return ctx;
};

export const TrainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedTrains, setSavedTrainsRaw] = useState<Train[]>([]);
  const [selectedTrain, setSelectedTrainRaw] = useState<Train | null>(null);

  const setSavedTrains: React.Dispatch<React.SetStateAction<Train[]>> = useCallback((action) => {
    setSavedTrainsRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      debug(`[TrainContext] Saved trains updated: ${prev.length} → ${next.length}`);
      return next;
    });
  }, []);

  const setSelectedTrain: React.Dispatch<React.SetStateAction<Train | null>> = useCallback((action) => {
    setSelectedTrainRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      debug(`[TrainContext] Selected train: ${next ? `${next.routeName || ''} ${next.trainNumber}` : 'none'}`);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ savedTrains, setSavedTrains, selectedTrain, setSelectedTrain }),
    [savedTrains, setSavedTrains, selectedTrain, setSelectedTrain]
  );

  return (
    <TrainContext.Provider value={value}>
      {children}
    </TrainContext.Provider>
  );
};
