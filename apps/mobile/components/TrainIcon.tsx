import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';

interface TrainIconProps {
  name?: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/** Returns true when the train name indicates Acela (high-speed). */
export function isAcelaName(name?: string | null): boolean {
  return !!name && name.toLowerCase().includes('acela');
}

/** Returns true when the service is Amtrak Thruway Connecting Service (bus). */
export function isThruwayName(name?: string | null): boolean {
  return !!name && name.toLowerCase().includes('amtrak thruway connecting');
}

/**
 * Renders the correct transport icon based on the train/route name.
 * Acela uses Ionicons bullet-train icon, thruway uses bus icon,
 * everything else uses FontAwesome6 train.
 */
export function TrainIcon({ name, size = 16, color, style }: TrainIconProps) {
  const colors = useColors();
  const resolvedColor = color ?? colors.primary;

  if (isThruwayName(name)) {
    return <Ionicons name="bus" size={size} color={resolvedColor} style={style} />;
  }
  if (isAcelaName(name)) {
    return <Ionicons name="train" size={size} color={resolvedColor} style={style} />;
  }
  return <FontAwesome6 name="train" size={Math.round(size * 0.8)} color={resolvedColor} style={style} />;
}
