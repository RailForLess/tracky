import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AppColors, Spacing } from '../../constants/theme';
import { formatDelayStatus } from '../../utils/time-formatting';
import AnimatedRollingText from './AnimatedRollingText';

interface TimeDisplayProps {
  time: string;
  dayOffset?: number;
  style?: StyleProp<TextStyle>;
  superscriptStyle?: StyleProp<TextStyle>;
  containerStyle?: ViewStyle;
  // Delay support
  delayMinutes?: number;
  delayedTime?: string;
  delayedDayOffset?: number;
  // Layout: 'horizontal' (default) = side by side, 'vertical' = stacked (delayed on top, original smaller below)
  delayLayout?: 'horizontal' | 'vertical';
  // Hide the (+#m) label next to delayed time
  hideDelayLabel?: boolean;
}

/**
 * Displays a time with an optional day offset as a superscript
 * e.g., "5:53 AM" with dayOffset=1 renders as "5:53 AM" with "+1" as superscript
 *
 * When delayMinutes > 0, shows original time with strikethrough in secondary color,
 * followed by the new delayed time in the primary style
 *
 * All time values use AnimatedRollingText for departure-board-style transitions.
 */
export default function TimeDisplay({
  time,
  dayOffset = 0,
  style,
  superscriptStyle,
  containerStyle,
  delayMinutes,
  delayedTime,
  delayedDayOffset,
  delayLayout = 'horizontal',
  hideDelayLabel = false,
}: TimeDisplayProps) {
  const hasDelay = delayMinutes != null && delayMinutes > 0 && delayedTime;
  const delayStr = hasDelay ? formatDelayStatus(delayMinutes) : '';

  if (hasDelay && delayLayout === 'vertical') {
    // Vertical layout: delayed time on top, original time smaller below
    return (
      <View style={[styles.delayContainerVertical, containerStyle]}>
        <View style={styles.container}>
          <AnimatedRollingText value={delayedTime!} style={[style, styles.delayedTime]} />
          {(delayedDayOffset ?? 0) > 0 && (
            <AnimatedRollingText value={`+${delayedDayOffset}`} style={[styles.superscript, superscriptStyle, styles.delayedSuperscript]} />
          )}
        </View>
        <View style={styles.originalTimeRow}>
          <AnimatedRollingText value={`${delayStr} · `} style={[style, styles.originalTimeSmall, styles.delayLabel]} />
          <View style={styles.originalTimeContainer}>
            <AnimatedRollingText value={time} style={[style, styles.originalTimeSmall]} />
            {dayOffset > 0 && (
              <Text style={[styles.superscript, superscriptStyle, styles.originalSuperscript, styles.originalSuperscriptSmall]}>+{dayOffset}</Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  if (hasDelay) {
    // Horizontal layout: side by side (default)
    const delayLabel = !hideDelayLabel ? ` (${delayStr})` : '';
    return (
      <View style={[styles.delayContainer, containerStyle]}>
        {/* New delayed time (primary) with delay label */}
        <View style={styles.container}>
          <AnimatedRollingText value={`${delayedTime}${delayLabel}`} style={[style, styles.delayedTime]} />
          {(delayedDayOffset ?? 0) > 0 && (
            <AnimatedRollingText value={`+${delayedDayOffset}`} style={[styles.superscript, superscriptStyle, styles.delayedSuperscript]} />
          )}
        </View>
        {/* Original time (strikethrough, faded) */}
        <View style={styles.originalTimeContainer}>
          <AnimatedRollingText value={time} style={[style, styles.originalTime]} />
          {dayOffset > 0 && (
            <Text style={[styles.superscript, superscriptStyle, styles.originalSuperscript]}>+{dayOffset}</Text>
          )}
        </View>
      </View>
    );
  }

  if (dayOffset === 0) {
    return <AnimatedRollingText value={time} style={style} />;
  }

  return (
    <View style={[styles.container, containerStyle]}>
      <AnimatedRollingText value={time} style={style} />
      <Text style={[styles.superscript, superscriptStyle]}>+{dayOffset}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  superscript: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.secondary,
    marginLeft: 2,
    marginTop: -2,
  },
  // Delay styles
  delayContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  delayContainerVertical: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  delayedTime: {
    color: AppColors.delayed,
  },
  delayedSuperscript: {
    color: AppColors.delayed,
  },
  originalTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  originalTimeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  originalTime: {
    textDecorationLine: 'line-through',
    color: AppColors.secondary,
    opacity: 0.7,
    fontSize: 14,
    fontWeight: '400',
  },
  originalTimeSmall: {
    textDecorationLine: 'line-through',
    color: AppColors.secondary,
    opacity: 0.7,
    fontSize: 11,
  },
  originalSuperscript: {
    textDecorationLine: 'line-through',
    color: AppColors.secondary,
    opacity: 0.7,
    fontSize: 9,
    marginTop: -1,
    marginLeft: 1,
  },
  originalSuperscriptSmall: {
    fontSize: 8,
  },
  delayLabel: {
    textDecorationLine: 'none',
  },
});
