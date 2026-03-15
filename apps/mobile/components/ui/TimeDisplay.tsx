import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { type ColorPalette, Spacing, withTextShadow } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { formatDelayStatus } from '../../utils/time-formatting';
import AnimatedRollingText from './AnimatedRollingText';

interface TimeDisplayProps {
  time: string;
  dayOffset?: number;
  style?: StyleProp<TextStyle>;
  superscriptStyle?: StyleProp<TextStyle>;
  containerStyle?: ViewStyle;
  delayMinutes?: number;
  delayedTime?: string;
  delayedDayOffset?: number;
  delayLayout?: 'horizontal' | 'vertical';
  hideDelayLabel?: boolean;
}

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create(withTextShadow({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    superscript: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.secondary,
      marginLeft: 2,
      marginTop: -2,
    },
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
      color: colors.delayed,
    },
    delayedSuperscript: {
      color: colors.delayed,
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
      color: colors.secondary,
      opacity: 0.7,
      fontSize: 14,
      fontWeight: '400',
    },
    originalTimeSmall: {
      textDecorationLine: 'line-through',
      color: colors.secondary,
      opacity: 0.7,
      fontSize: 11,
    },
    originalSuperscript: {
      textDecorationLine: 'line-through',
      color: colors.secondary,
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
  }, colors.textShadow));

function formatDayOffset(offset: number): string {
  return offset > 0 ? `+${offset}` : `${offset}`;
}

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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasDelay = delayMinutes != null && delayMinutes > 0 && delayedTime;
  const delayStr = hasDelay ? formatDelayStatus(delayMinutes) : '';

  if (hasDelay && delayLayout === 'vertical') {
    return (
      <View style={[styles.delayContainerVertical, containerStyle]}>
        <View style={styles.container}>
          <AnimatedRollingText value={delayedTime!} style={[style, styles.delayedTime]} />
          {(delayedDayOffset ?? 0) !== 0 && (
            <AnimatedRollingText value={formatDayOffset(delayedDayOffset!)} style={[styles.superscript, superscriptStyle, styles.delayedSuperscript]} />
          )}
        </View>
        <View style={styles.originalTimeRow}>
          <AnimatedRollingText value={`${delayStr} · `} style={[style, styles.originalTimeSmall, styles.delayLabel]} />
          <View style={styles.originalTimeContainer}>
            <AnimatedRollingText value={time} style={[style, styles.originalTimeSmall]} />
            {dayOffset !== 0 && (
              <Text style={[styles.superscript, superscriptStyle, styles.originalSuperscript, styles.originalSuperscriptSmall]}>{formatDayOffset(dayOffset)}</Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  if (hasDelay) {
    const delayLabel = !hideDelayLabel ? ` (${delayStr})` : '';
    return (
      <View style={[styles.delayContainer, containerStyle]}>
        <View style={styles.container}>
          <AnimatedRollingText value={`${delayedTime}${delayLabel}`} style={[style, styles.delayedTime]} />
          {(delayedDayOffset ?? 0) !== 0 && (
            <AnimatedRollingText value={formatDayOffset(delayedDayOffset!)} style={[styles.superscript, superscriptStyle, styles.delayedSuperscript]} />
          )}
        </View>
        <View style={styles.originalTimeContainer}>
          <AnimatedRollingText value={time} style={[style, styles.originalTime]} />
          {dayOffset !== 0 && (
            <Text style={[styles.superscript, superscriptStyle, styles.originalSuperscript]}>{formatDayOffset(dayOffset)}</Text>
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
      <Text style={[styles.superscript, superscriptStyle]}>{formatDayOffset(dayOffset)}</Text>
    </View>
  );
}
