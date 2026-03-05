import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { AppColors, FontSizes, Spacing } from '../constants/theme';
import { COLORS, styles } from '../screens/styles';
import { getDelayColorKey, parseTimeToDate } from '../utils/time-formatting';
import AnimatedRollingText from './ui/AnimatedRollingText';
import MarqueeText from './ui/MarqueeText';
import TimeDisplay from './ui/TimeDisplay';

const DELAY_COLORS = {
  delayed: AppColors.delayed,
  onTime: AppColors.success,
} as const;

interface TrainCardContentProps {
  countdownValue: number;
  countdownLabel: string;
  isPast: boolean;
  routeName: string;
  trainNumber: string;
  date?: string;
  daysAway?: number;
  fromName: string;
  toName: string;
  fromCode: string;
  toCode: string;
  departTime: string;
  arriveTime: string;
  departDayOffset?: number;
  arriveDayOffset?: number;
  intermediateStopCount?: number;
  // Delay props for departure
  departDelayMinutes?: number;
  departDelayedTime?: string;
  departDelayedDayOffset?: number;
  // Delay props for arrival
  arriveDelayMinutes?: number;
  arriveDelayedTime?: string;
  arriveDelayedDayOffset?: number;
  /** When true, only fade out after arrival (not on departure). Used in My Trains list. */
  fadeOnlyOnArrival?: boolean;
}

export default function TrainCardContent({
  countdownValue,
  countdownLabel,
  isPast,
  routeName,
  trainNumber,
  date,
  daysAway,
  fromName,
  toName,
  fromCode,
  toCode,
  departTime,
  arriveTime,
  departDayOffset,
  arriveDayOffset,
  intermediateStopCount,
  departDelayMinutes,
  departDelayedTime,
  departDelayedDayOffset,
  arriveDelayMinutes,
  arriveDelayedTime,
  arriveDelayedDayOffset,
  fadeOnlyOnArrival,
}: TrainCardContentProps) {
  const isToday = daysAway != null && daysAway <= 0;

  const isArrived = useMemo(() => {
    if (!isPast || !arriveTime) return false;
    const now = new Date();
    const arrive = parseTimeToDate(arriveTime, now);
    if (arriveDayOffset) arrive.setDate(arrive.getDate() + arriveDayOffset);
    const delay = arriveDelayMinutes ?? 0;
    return now.getTime() >= arrive.getTime() + delay * 60 * 1000;
  }, [isPast, arriveTime, arriveDayOffset, arriveDelayMinutes]);

  const shouldFadeTitle = fadeOnlyOnArrival ? isArrived : isPast;
  const pastColor = isPast ? { color: AppColors.secondary } : undefined;

  return (
    <View style={localStyles.row}>
      <View style={[styles.trainLeft, isPast && { opacity: 0.4 }]}>
        <AnimatedRollingText value={String(countdownValue)} style={[styles.daysAway, pastColor]} />
        <AnimatedRollingText value={countdownLabel} style={[styles.daysLabel, pastColor]} />
      </View>

      <View style={styles.trainCenter}>
        <View style={styles.trainHeader}>
          <Image
            source={require('../assets/images/amtrak.png')}
            style={[styles.amtrakLogo, isPast && { opacity: 0.4 }]}
            fadeDuration={0}
          />
          <Text style={[styles.trainNumber, { color: COLORS.secondary, fontWeight: '400' }]}>
            {routeName} {trainNumber}
          </Text>
          {intermediateStopCount != null && intermediateStopCount > 0 && (
            <AnimatedRollingText
              value={`${intermediateStopCount} stop${intermediateStopCount !== 1 ? 's' : ''}`}
              style={localStyles.stops}
            />
          )}
          {isToday ? (
            <AnimatedRollingText
              style={[styles.trainDate, {
                color: isPast
                  ? (isArrived ? AppColors.secondary : AppColors.inProgress)
                  : departDelayMinutes && departDelayMinutes > 0
                    ? DELAY_COLORS.delayed
                    : DELAY_COLORS.onTime,
              }]}
              value={isPast
                ? (isArrived ? 'Completed' : 'In Progress')
                : departDelayMinutes && departDelayMinutes > 0
                  ? `Delayed ${Math.floor(departDelayMinutes / 60) >= 1 ? `${Math.floor(departDelayMinutes / 60)}h` : ''}${departDelayMinutes % 60 > 0 ? `${departDelayMinutes % 60}m` : ''}`
                  : 'On Time'}
            />
          ) : date != null ? (
            <Text style={styles.trainDate}>{date}</Text>
          ) : null}
        </View>

        <MarqueeText
          text={`${fromName} to ${toName}`}
          style={[styles.route, { fontSize: 18 }, shouldFadeTitle ? { color: AppColors.secondary } : undefined]}
        >
          {fromName} <Text style={{ fontWeight: 'normal' }}>to</Text> {toName}
        </MarqueeText>

        <View style={styles.timeRow}>
          {(() => {
            const depColorKey = getDelayColorKey(departDelayMinutes);
            const depBg = depColorKey ? DELAY_COLORS[depColorKey] : pastColor?.color ?? AppColors.secondary;
            return (
              <View style={styles.timeInfo}>
                <View style={[styles.arrowIcon, { backgroundColor: depBg }]}>
                  <MaterialCommunityIcons name="arrow-top-right" size={10} color={AppColors.background.tertiary} />
                </View>
                <Text style={styles.timeCode}>{fromCode}</Text>
                <TimeDisplay
                  time={departDelayMinutes && departDelayMinutes > 0 && departDelayedTime ? departDelayedTime : departTime}
                  dayOffset={departDelayMinutes && departDelayMinutes > 0 && departDelayedDayOffset != null ? departDelayedDayOffset : departDayOffset}
                  style={[styles.timeValue, pastColor, depColorKey && { color: DELAY_COLORS[depColorKey] }]}
                  superscriptStyle={[localStyles.timeSuperscript, depColorKey && { color: DELAY_COLORS[depColorKey] }]}
                />
              </View>
            );
          })()}

          {(() => {
            const arrColorKey = getDelayColorKey(arriveDelayMinutes);
            const arrBg = arrColorKey ? DELAY_COLORS[arrColorKey] : pastColor?.color ?? AppColors.secondary;
            return (
              <View style={styles.timeInfo}>
                <View style={[styles.arrowIcon, { backgroundColor: arrBg }]}>
                  <MaterialCommunityIcons name="arrow-bottom-left" size={10} color={AppColors.background.tertiary} />
                </View>
                <Text style={styles.timeCode}>{toCode}</Text>
                <TimeDisplay
                  time={arriveDelayMinutes && arriveDelayMinutes > 0 && arriveDelayedTime ? arriveDelayedTime : arriveTime}
                  dayOffset={arriveDelayMinutes && arriveDelayMinutes > 0 && arriveDelayedDayOffset != null ? arriveDelayedDayOffset : arriveDayOffset}
                  style={[styles.timeValue, pastColor, arrColorKey && { color: DELAY_COLORS[arrColorKey] }]}
                  superscriptStyle={[localStyles.timeSuperscript, arrColorKey && { color: DELAY_COLORS[arrColorKey] }]}
                />
              </View>
            );
          })()}
        </View>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: Spacing.lg,
  },
  stops: {
    fontSize: FontSizes.daysLabel,
    color: AppColors.secondary,
    marginLeft: 'auto',
  },
  timeSuperscript: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.secondary,
    marginLeft: 2,
    marginTop: -2,
  },
});
