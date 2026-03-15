import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { type ColorPalette, withTextShadow } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useUnits } from '../../context/UnitsContext';
import AnimatedRollingText from './AnimatedRollingText';

interface TrainSpeedPillProps {
  speed: number | undefined;
  bearing: number | undefined;
  visible: boolean;
}

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function bearingToCompass(bearing: number): string {
  const index = Math.round(bearing / 45) % 8;
  return COMPASS_DIRECTIONS[index];
}

function metersPerSecToMph(mps: number): number {
  return mps * 2.23694;
}

function metersPerSecToKmh(mps: number): number {
  return mps * 3.6;
}

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create(withTextShadow({
    container: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 999,
    },
    pill: {
      backgroundColor: colors.background.primary,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.secondary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    segment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    divider: {
      width: 1,
      height: 14,
      backgroundColor: colors.border.secondary,
    },
    valueText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
    },
  }, colors.textShadow));

export function TrainSpeedPill({ speed, bearing, visible }: TrainSpeedPillProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { distanceUnit } = useUnits();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const isVisible = useRef(false);

  const hasData = visible && (speed != null || bearing != null);

  const lastSpeed = useRef(speed);
  const lastBearing = useRef(bearing);
  if (speed != null) lastSpeed.current = speed;
  if (bearing != null) lastBearing.current = bearing;

  useEffect(() => {
    if (hasData && !isVisible.current) {
      isVisible.current = true;
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!hasData && isVisible.current) {
      isVisible.current = false;
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -80,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [hasData, slideAnim, opacityAnim, contentOpacity]);

  const displaySpeed = speed ?? lastSpeed.current;
  const displayBearing = bearing ?? lastBearing.current;

  const speedDisplay =
    displaySpeed != null
      ? distanceUnit === 'km'
        ? `${Math.round(metersPerSecToKmh(displaySpeed))} km/h`
        : `${Math.round(metersPerSecToMph(displaySpeed))} mph`
      : null;

  const bearingDisplay = displayBearing != null ? bearingToCompass(displayBearing) : null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { top: insets.top + 4, transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <View style={styles.pill}>
        <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
          {speedDisplay && (
            <View style={styles.segment}>
              <Ionicons name="speedometer-outline" size={14} color={colors.secondary} />
              <AnimatedRollingText value={speedDisplay} style={styles.valueText} />
            </View>
          )}
          {speedDisplay && bearingDisplay && <View style={styles.divider} />}
          {bearingDisplay && (
            <View style={styles.segment}>
              <Ionicons name="compass-outline" size={14} color={colors.secondary} />
              <AnimatedRollingText value={bearingDisplay} style={styles.valueText} />
              <AnimatedRollingText value={`${Math.round(displayBearing!)}°`} style={styles.valueText} />
            </View>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}
