import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { type ColorPalette, withTextShadow } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import AnimatedRollingText from './AnimatedRollingText';
import { NoticeBubble } from './NoticeBubble';

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create(withTextShadow({
    pctText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '700',
      minWidth: 32,
      textAlign: 'right',
    },
    retryText: {
      fontSize: 11,
      color: 'rgba(255, 69, 58, 0.9)',
      fontWeight: '600',
    },
  }, colors.textShadow));

interface LoadingBubbleProps {
  visible: boolean;
  text: string;
  /** 0–1 progress. Omit for indeterminate. */
  progress?: number;
  /** Show error state with retry interaction */
  error?: boolean;
  errorLabel?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function LoadingBubble({
  visible,
  text,
  progress,
  error,
  errorLabel = 'Tap to retry',
  onRetry,
  onDismiss,
}: LoadingBubbleProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const progressPct = progress != null ? Math.round(progress * 100) : null;
  const isDone = progress != null && progress >= 1;

  const trailing = error ? (
    <Text style={styles.retryText}>{errorLabel}</Text>
  ) : progressPct != null ? (
    <AnimatedRollingText value={`${progressPct}%`} style={styles.pctText} />
  ) : undefined;

  return (
    <NoticeBubble
      visible={visible}
      spinner={!error && !isDone}
      icon={error ? '✕' : '✓'}
      text={text}
      progress={error ? undefined : progress}
      error={error}
      interactive={error}
      onPress={onRetry}
      onLongPress={onDismiss}
      trailing={trailing}
    />
  );
}
