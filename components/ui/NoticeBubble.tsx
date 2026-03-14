import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ColorPalette, withTextShadow } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create(withTextShadow({
    container: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 9999,
    },
    pill: {
      backgroundColor: colors.background.tertiary,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.secondary,
      minWidth: 200,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    pillError: {
      borderColor: 'rgba(255, 69, 58, 0.4)',
    },
    progressTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: colors.border.primary,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accentBlue,
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
      color: colors.primary,
    },
    text: {
      flexShrink: 0,
      fontSize: 12,
      color: colors.secondary,
      fontWeight: '500',
    },
  }, colors.textShadow));

interface NoticeBubbleProps {
  visible: boolean;
  /** Text icon (e.g. '✕', '✓'). Ignored when `spinner` is true. */
  icon?: string;
  /** Show a spinning ActivityIndicator instead of a text icon */
  spinner?: boolean;
  text: string;
  /** 0–1 progress bar. Omit to hide the progress track. */
  progress?: number;
  /** Render error-style border */
  error?: boolean;
  /** Interactive — enables pointer events */
  interactive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Extra content rendered after the text (e.g. percentage, retry label) */
  trailing?: React.ReactNode;
}

export function NoticeBubble({
  visible,
  icon,
  spinner,
  text,
  progress,
  error,
  interactive,
  onPress,
  onLongPress,
  trailing,
}: NoticeBubbleProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const isShown = useRef(false);

  useEffect(() => {
    if (visible && !isShown.current) {
      isShown.current = true;
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
    } else if (!visible && isShown.current) {
      isShown.current = false;
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
  }, [visible, slideAnim, opacityAnim]);

  const pillContent = (
    <View style={[styles.pill, error && styles.pillError]}>
      {progress != null && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(5, Math.round(progress * 100))}%` }]} />
        </View>
      )}
      <View style={styles.content}>
        {spinner ? (
          <ActivityIndicator size="small" color={colors.secondary} />
        ) : (
          <Text style={styles.icon}>{icon}</Text>
        )}
        <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
          {text}
        </Text>
        {trailing}
      </View>
    </View>
  );

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[
        styles.container,
        { top: insets.top + 4, transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      {interactive ? (
        <Pressable onPress={onPress} onLongPress={onLongPress}>
          {pillContent}
        </Pressable>
      ) : (
        pillContent
      )}
    </Animated.View>
  );
}
