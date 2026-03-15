import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { type ColorPalette } from '../../../constants/theme';
import { TrainIcon } from '../../TrainIcon';
import AnimatedRollingText from '../AnimatedRollingText';
import type { CountdownBannerProps } from '../TrainDetailModal';

export default function CountdownBanner({
  countdown,
  unitLabel,
  isLiveTrain,
  isCompleted,
  arrivalCountdown,
  bannerBg,
  bannerColor,
  routeName,
  styles,
  colors,
}: CountdownBannerProps) {
  return (
    <View style={[styles.expandableSection, bannerBg != null && { backgroundColor: bannerBg }]}>
      <View style={styles.statusRow}>
        {isLiveTrain ? (
          <TrainIcon name={routeName} size={20} color={bannerColor} style={{ marginRight: 8 }} />
        ) : (
          <Ionicons name="time-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
        )}
        <Text style={[styles.statusText, { color: bannerColor }]}>
          {isLiveTrain && !isCompleted ? 'En route, ' : ''}
          {isCompleted ? 'Completed ' : countdown.past ? (isLiveTrain ? 'departed ' : 'Departed ') : (isLiveTrain ? 'departs in ' : 'Departs in ')}
        </Text>
        <AnimatedRollingText value={String(isCompleted ? arrivalCountdown.value : countdown.value)} style={[styles.statusText, { fontWeight: 'bold', color: bannerColor }]} />
        <Text style={[styles.statusText, { color: bannerColor }]}>{' '}{isCompleted ? `${arrivalCountdown.unit} ago` : unitLabel.toLowerCase()}</Text>
      </View>
    </View>
  );
}
