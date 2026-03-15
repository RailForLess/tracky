import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { type ColorPalette, FontSizes, Spacing, withTextShadow } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { createStyles } from '../screens/styles';
import { getDelayColorKey, parseTimeToMinutes } from '../utils/time-formatting';
import { pluralCount } from '../utils/train-display';
import { gtfsParser } from '../utils/gtfs-parser';
import { getCurrentSecondsInTimezone, getTimezoneForStop } from '../utils/timezone';
import AnimatedRollingText from './ui/AnimatedRollingText';
import MarqueeText from './ui/MarqueeText';
import TimeDisplay from './ui/TimeDisplay';

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
  departDelayMinutes?: number;
  departDelayedTime?: string;
  departDelayedDayOffset?: number;
  arriveDelayMinutes?: number;
  arriveDelayedTime?: string;
  arriveDelayedDayOffset?: number;
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const localStyles = useMemo(() => createLocalStyles(colors), [colors]);

  const DELAY_COLORS = {
    delayed: colors.delayed,
    onTime: colors.success,
  } as const;

  const isToday = daysAway != null && daysAway <= 0;

  const isArrived = useMemo(() => {
    if (!isPast || !arriveTime) return false;
    const toStop = gtfsParser.getStop(toCode);
    const arriveTz = toStop ? getTimezoneForStop(toStop) : gtfsParser.agencyTimezone;
    const nowSec = getCurrentSecondsInTimezone(arriveTz);
    const arriveSec = parseTimeToMinutes(arriveTime) * 60
      + (arriveDayOffset ?? 0) * 24 * 3600;
    const delaySec = (arriveDelayMinutes ?? 0) * 60;
    return nowSec >= arriveSec + delaySec + (daysAway ?? 0) * 86400;
  }, [isPast, arriveTime, arriveDayOffset, arriveDelayMinutes, toCode, daysAway]);

  const shouldFadeTitle = fadeOnlyOnArrival ? isArrived : isPast;
  const pastColor = isPast ? { color: colors.secondary } : undefined;

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
          <Text style={[styles.trainNumber, { color: colors.secondary, fontWeight: '400' }]}>
            {routeName} {trainNumber}
          </Text>
          {intermediateStopCount != null && intermediateStopCount > 0 && (
            <AnimatedRollingText
              value={pluralCount(intermediateStopCount, 'stop')}
              style={localStyles.stops}
            />
          )}
          {isToday ? (
            <AnimatedRollingText
              style={[styles.trainDate, {
                color: isPast
                  ? (isArrived ? colors.secondary : colors.inProgress)
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
          style={[styles.route, { fontSize: 18 }, shouldFadeTitle ? { color: colors.secondary } : undefined]}
        >
          {fromName} <Text style={{ fontWeight: 'normal' }}>to</Text> {toName}
        </MarqueeText>

        <View style={styles.timeRow}>
          {(() => {
            const depColorKey = getDelayColorKey(departDelayMinutes);
            const depBg = depColorKey ? DELAY_COLORS[depColorKey] : pastColor?.color ?? colors.secondary;
            return (
              <View style={styles.timeInfo}>
                <View style={[styles.arrowIcon, { backgroundColor: depBg }]}>
                  <MaterialCommunityIcons name="arrow-top-right" size={10} color={colors.background.primary} />
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
            const arrBg = arrColorKey ? DELAY_COLORS[arrColorKey] : pastColor?.color ?? colors.secondary;
            return (
              <View style={styles.timeInfo}>
                <View style={[styles.arrowIcon, { backgroundColor: arrBg }]}>
                  <MaterialCommunityIcons name="arrow-bottom-left" size={10} color={colors.background.primary} />
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

const createLocalStyles = (colors: ColorPalette) =>
  StyleSheet.create(withTextShadow({
    row: {
      flexDirection: 'row',
      padding: Spacing.lg,
    },
    stops: {
      fontSize: FontSizes.daysLabel,
      color: colors.secondary,
      marginLeft: 'auto',
    },
    timeSuperscript: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.secondary,
      marginLeft: 2,
      marginTop: -2,
    },
  }, colors.textShadow));
