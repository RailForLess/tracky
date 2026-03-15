import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { type ColorPalette, DarkColors, LightColors, getCloseButtonStyle } from '../constants/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'themeMode';

interface ThemeContextType {
  colors: ColorPalette;
  isDark: boolean;
  closeButtonStyle: ReturnType<typeof getCloseButtonStyle>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export const useColors = () => useTheme().colors;

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        setThemeModeState(raw);
      }
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const isDark =
    themeMode === 'system' ? systemScheme !== 'light' :
    themeMode === 'dark';
  const colors = isDark ? DarkColors : LightColors;

  const value = useMemo(
    () => ({ colors, isDark, closeButtonStyle: getCloseButtonStyle(colors, isDark), themeMode, setThemeMode }),
    [colors, isDark, themeMode, setThemeMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
