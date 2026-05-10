import React from 'react';
import { useGTFSRefresh } from '../../context/GTFSRefreshContext';
import { light as hapticLight, warning as hapticWarning } from '../../utils/haptics';
import { LoadingBubble } from './LoadingBubble';

export function RefreshBubble() {
  const { isRefreshing, isStreamingData, refreshProgress, refreshStep, refreshFailed, triggerRefresh, dismissRefreshFailure } =
    useGTFSRefresh();

  const handleRetry = () => {
    if (refreshFailed) {
      hapticLight();
      triggerRefresh();
    }
  };

  const handleDismiss = () => {
    if (refreshFailed) {
      hapticWarning();
      dismissRefreshFailure();
    }
  };

  // Streaming data bubble (shapes loading after splash)
  if (isStreamingData && !isRefreshing) {
    return (
      <LoadingBubble
        visible
        text="Streaming stations & routes"
      />
    );
  }

  // Refresh / failure bubble
  return (
    <LoadingBubble
      visible={isRefreshing || refreshFailed}
      text={refreshFailed ? (refreshStep || 'Schedule update failed') : refreshStep || 'Updating schedule...'}
      progress={refreshFailed ? undefined : refreshProgress}
      error={refreshFailed}
      onRetry={handleRetry}
      onDismiss={handleDismiss}
    />
  );
}
