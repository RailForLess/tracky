import { logger } from './logger';

/**
 * Map WMO weather code to a human-readable condition and Ionicons icon name.
 * See https://open-meteo.com/en/docs for weather code definitions.
 */
export function getWeatherCondition(code: number): { condition: string; icon: string } {
  if (code === 0) return { condition: 'Clear', icon: 'sunny' };
  if (code <= 3) return { condition: 'Partly Cloudy', icon: 'partly-sunny' };
  if (code <= 48) return { condition: 'Foggy', icon: 'cloud' };
  if (code <= 67) return { condition: 'Rainy', icon: 'rainy' };
  if (code <= 77) return { condition: 'Snowy', icon: 'snow' };
  if (code <= 99) return { condition: 'Stormy', icon: 'thunderstorm' };
  return { condition: 'Scattered Clouds', icon: 'cloud' };
}

export interface CurrentWeather {
  temp: number;
  condition: string;
  icon: string;
}

/**
 * Fetch current weather for a location from Open-Meteo.
 * @param unit - 'fahrenheit' or 'celsius'
 */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  unit: 'fahrenheit' | 'celsius' = 'fahrenheit'
): Promise<CurrentWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=${unit}&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const { condition, icon } = getWeatherCondition(data.current.weather_code);
    return { temp, condition, icon };
  } catch (e) {
    logger.error('[Weather] fetchCurrentWeather failed:', e);
    return null;
  }
}
