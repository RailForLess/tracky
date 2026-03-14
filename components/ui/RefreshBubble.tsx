import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { type ColorPalette, withTextShadow } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useGTFSRefresh } from '../../context/GTFSRefreshContext';
import { light as hapticLight, warning as hapticWarning } from '../../utils/haptics';
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

export function RefreshBubble() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isRefreshing, isStreamingData, refreshProgress, refreshStep, refreshFailed, triggerRefresh, dismissRefreshFailure } =
    useGTFSRefresh();

  const progressPct = Math.round(refreshProgress * 100);
  const isDone = refreshProgress >= 1;

  const handlePress = () => {
    if (refreshFailed) {
      hapticLight();
      triggerRefresh();
    }
  };

  const handleLongPress = () => {
    if (refreshFailed) {
      hapticWarning();
      dismissRefreshFailure();
    }
  };

  // Streaming data bubble (shapes loading after splash)
  if (isStreamingData && !isRefreshing) {
    return (
      <NoticeBubble
        visible
        spinner
        text="Streaming stations & routes"
      />
    );
  }

  // Refresh / failure bubble
  return (
    <NoticeBubble
      visible={isRefreshing || refreshFailed}
      spinner={!refreshFailed && !isDone}
      icon={refreshFailed ? '✕' : '✓'}
      text={refreshFailed ? (refreshStep || 'Schedule update failed') : refreshStep || 'Updating schedule...'}
      progress={refreshFailed ? undefined : refreshProgress}
      error={refreshFailed}
      interactive={refreshFailed}
      onPress={handlePress}
      onLongPress={handleLongPress}
      trailing={
        refreshFailed ? (
          <Text style={styles.retryText}>Tap to retry</Text>
        ) : (
          <AnimatedRollingText value={`${progressPct}%`} style={styles.pctText} />
        )
      }
    />
  );
}
