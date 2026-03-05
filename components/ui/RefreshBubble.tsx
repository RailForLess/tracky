import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '../../constants/theme';
import { useGTFSRefresh } from '../../context/GTFSRefreshContext';
import AnimatedRollingText from './AnimatedRollingText';

/**
 * A floating pill that appears below the Dynamic Island / status bar
 * showing GTFS refresh progress while the user continues using the app.
 * Persists on failure with a tap-to-retry action until dismissed.
 */
export function RefreshBubble() {
  const insets = useSafeAreaInsets();
  const { isRefreshing, refreshProgress, refreshStep, refreshFailed, triggerRefresh, dismissRefreshFailure } =
    useGTFSRefresh();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const isVisible = useRef(false);

  const shouldShow = isRefreshing || refreshFailed;

  useEffect(() => {
    if (shouldShow && !isVisible.current) {
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
      ]).start();
    } else if (!shouldShow && isVisible.current) {
      isVisible.current = false;
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -80,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldShow, slideAnim, opacityAnim]);

  const progressPct = Math.round(refreshProgress * 100);
  const isDone = refreshProgress >= 1;

  const handlePress = () => {
    if (refreshFailed) {
      triggerRefresh();
    }
  };

  const handleLongPress = () => {
    if (refreshFailed) {
      dismissRefreshFailure();
    }
  };

  const pillContent = (
    <View style={[styles.pill, refreshFailed && styles.pillFailed]}>
      {/* Progress bar background */}
      {!refreshFailed && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(5, progressPct)}%` }]} />
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.icon}>{refreshFailed ? '✕' : isDone ? '✓' : '⟳'}</Text>
        <Text style={styles.stepText} numberOfLines={1} ellipsizeMode="tail">
          {refreshFailed ? (refreshStep || 'Schedule update failed') : refreshStep || 'Updating schedule...'}
        </Text>
        {refreshFailed ? (
          <Text style={styles.retryText}>Tap to retry</Text>
        ) : (
          <AnimatedRollingText value={`${progressPct}%`} style={styles.pctText} />
        )}
      </View>
    </View>
  );

  return (
    <Animated.View
      pointerEvents={refreshFailed ? 'auto' : 'none'}
      style={[
        styles.container,
        { top: insets.top + 4, transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      {refreshFailed ? (
        <Pressable onPress={handlePress} onLongPress={handleLongPress}>
          {pillContent}
        </Pressable>
      ) : (
        pillContent
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    backgroundColor: AppColors.background.tertiary,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.border.secondary,
    minWidth: 200,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pillFailed: {
    borderColor: 'rgba(255, 69, 58, 0.4)',
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: AppColors.border.primary,
  },
  progressFill: {
    height: '100%',
    backgroundColor: AppColors.accentBlue,
    borderRadius: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  icon: {
    fontSize: 14,
    color: AppColors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: AppColors.secondary,
    fontWeight: '500',
  },
  pctText: {
    fontSize: 12,
    color: AppColors.primary,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },
  retryText: {
    fontSize: 11,
    color: 'rgba(255, 69, 58, 0.9)',
    fontWeight: '600',
  },
});
