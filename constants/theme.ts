export type ColorPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  accent: string;
  accentBlue: string;
  success: string;
  error: string;
  delayed: string;
  inProgress: string;
  shadow: string;
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  border: {
    primary: string;
    secondary: string;
  };
};

export const DarkColors: ColorPalette = {
  primary: '#fff',
  secondary: 'rgba(255, 255, 255, 0.5)',
  tertiary: 'rgba(255, 255, 255, 0.2)',
  accent: '#FF6B35',
  accentBlue: '#FFFFFF',
  success: '#10B981',
  error: '#EF4444',
  delayed: '#EF4444',
  inProgress: '#10B981',
  shadow: '#000',
  background: {
    primary: '#18181B',
    secondary: '#1D1D1F',
    tertiary: '#29292D',
  },
  border: {
    primary: '#2C2C30',
    secondary: '#3A3A3F',
  },
};

export const LightColors: ColorPalette = {
  primary: '#fff',
  secondary: 'rgba(255, 255, 255, 0.5)',
  tertiary: 'rgba(255, 255, 255, 0.2)',
  accent: '#FF6B35',
  accentBlue: '#FFFFFF',
  success: '#10B981',
  error: '#EF4444',
  delayed: '#EF4444',
  inProgress: '#10B981',
  shadow: '#000',
  background: {
    primary: 'rgba(255, 255, 255, 0.12)',
    secondary: 'rgba(255, 255, 255, 0.08)',
    tertiary: 'rgba(255, 255, 255, 0.05)',
  },
  border: {
    primary: 'rgba(255, 255, 255, 0.15)',
    secondary: 'rgba(255, 255, 255, 0.10)',
  },
};

export const FontSizes = {
  title: 28,
  searchLabel: 16,
  daysAway: 32,
  daysLabel: 12,
  trainNumber: 14,
  trainDate: 13,
  route: 13,
  timeCode: 12,
  timeValue: 13,
  timeLabel: 10,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 32,
};

export const getCloseButtonStyle = (colors: ColorPalette) => ({
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: colors.background.secondary,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderWidth: 1,
  borderColor: colors.border.primary,
});

