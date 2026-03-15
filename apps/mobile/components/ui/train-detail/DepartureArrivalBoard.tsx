import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { type ColorPalette, Spacing } from '../../../constants/theme';
import { addDelayToTime, formatDelayStatus, getDelayColorKey, parseTimeToMinutes } from '../../../utils/time-formatting';
import { getCurrentSecondsInTimezone } from '../../../utils/timezone';
import { pluralCount } from '../../../utils/train-display';
import { convertDistance, distanceSuffix } from '../../../utils/units';
import { gtfsParser } from '../../../utils/gtfs-parser';
import { getTimezoneForStop } from '../../../utils/timezone';
import { pluralize } from '../../../utils/train-display';
import AnimatedRollingText from '../AnimatedRollingText';
import TimeDisplay from '../TimeDisplay';
import type { DepartureArrivalBoardProps } from '../TrainDetailModal';

export default function DepartureArrivalBoard({
  trainData,
  countdown,
  duration,
  distanceMiles,
  distanceUnit,
  allStops,
  styles,
  colors,
  handleStationPress,
}: DepartureArrivalBoardProps) {
  return (
    <View style={styles.departArriveBoard}>
      {/* Departure Info */}
      <View style={[styles.infoSection, { paddingBottom: 0 }]}>
        <View style={styles.infoHeader}>
          <MaterialCommunityIcons name="arrow-top-right" size={16} color={colors.primary} />
          <TouchableOpacity
            style={styles.stationTouchable}
            onPress={() => handleStationPress(trainData.fromCode)}
            activeOpacity={0.7}
          >
            <Text style={styles.locationCode}>{trainData.fromCode}</Text>
            <Text style={styles.locationName}> · {trainData.from}</Text>
          </TouchableOpacity>
        </View>
        {(() => {
          const dDelay = trainData.daysAway <= 0 ? trainData.realtime?.delay : undefined;
          const dDelayed = dDelay && dDelay > 0 ? addDelayToTime(trainData.departTime, dDelay, 0) : undefined;
          const colorKey = getDelayColorKey(dDelay);
          const timeColor = colorKey === 'onTime' ? colors.success : undefined;
          return (
            <>
              <TimeDisplay
                time={trainData.departTime}
                dayOffset={0}
                style={[styles.timeText, timeColor && { color: timeColor }]}
                superscriptStyle={[styles.timeSuperscript, timeColor && { color: timeColor }]}
                delayMinutes={dDelay}
                delayedTime={dDelayed?.time}
                delayedDayOffset={dDelayed?.dayOffset}
                hideDelayLabel
              />
              {trainData.daysAway <= 0 && dDelay != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <AnimatedRollingText
                    value={formatDelayStatus(dDelay)}
                    style={[styles.delayStatusText, colorKey === 'delayed' ? styles.delayStatusLate : styles.delayStatusEarly]}
                  />
                  {countdown && (
                    <AnimatedRollingText
                      value={` · ${countdown.past ? `Departed ${countdown.value} ${countdown.unit.toLowerCase()} ago` : `Departs in ${countdown.value} ${countdown.unit.toLowerCase()}`}`}
                      style={[styles.delayStatusText, styles.countdownInline]}
                    />
                  )}
                </View>
              )}
            </>
          );
        })()}
        <View style={styles.durationLineRow}>
          <View style={styles.durationContentRow}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={14}
              color={colors.secondary}
              style={{ marginRight: Spacing.sm }}
            />
            <AnimatedRollingText value={duration} style={styles.durationText} />
            {distanceMiles !== null && (
              <AnimatedRollingText
                value={` · ${Math.round(convertDistance(distanceMiles, distanceUnit)).toLocaleString()} ${distanceSuffix(distanceUnit)}`}
                style={[styles.durationText, { marginLeft: 0 }]}
              />
            )}
            {allStops.length > 0 && (
              <AnimatedRollingText
                value={` · ${allStops.length - 1} ${pluralize(allStops.length - 1, 'stop')}`}
                style={[styles.durationText, { marginLeft: 0 }]}
              />
            )}
          </View>
          <View style={styles.horizontalLine} />
        </View>
      </View>

      {/* Arrival Info */}
      <View style={[styles.infoSection, { paddingTop: 0 }]}>
        <View style={styles.infoHeader}>
          <MaterialCommunityIcons name="arrow-bottom-left" size={16} color={colors.primary} />
          <TouchableOpacity
            style={styles.stationTouchable}
            onPress={() => handleStationPress(trainData.toCode)}
            activeOpacity={0.7}
          >
            <Text style={styles.locationCode}>{trainData.toCode}</Text>
            <Text style={styles.locationName}> · {trainData.to}</Text>
          </TouchableOpacity>
        </View>
        {(() => {
          const aDelay = trainData.daysAway <= 0 ? trainData.realtime?.arrivalDelay : undefined;
          const aDelayed = aDelay && aDelay > 0 ? addDelayToTime(trainData.arriveTime, aDelay, trainData.arriveDayOffset || 0) : undefined;
          const colorKey = getDelayColorKey(aDelay);
          const timeColor = colorKey === 'onTime' ? colors.success : undefined;
          // Compute arrival countdown
          const arriveTime = aDelayed?.time || trainData.arriveTime;
          const arriveDayOffset = aDelayed?.dayOffset ?? (trainData.arriveDayOffset || 0);
          const destStopData = gtfsParser.getStop(trainData.toCode);
          const destTimezone = destStopData ? getTimezoneForStop(destStopData) : gtfsParser.agencyTimezone;
          const nowSec = getCurrentSecondsInTimezone(destTimezone);
          const arriveSec = parseTimeToMinutes(arriveTime) * 60
            + arriveDayOffset * 24 * 3600;
          const arrDeltaSec = arriveSec + (trainData.daysAway ?? 0) * 86400 - nowSec;
          const arrPast = arrDeltaSec < 0;
          const arrAbsSec = Math.abs(arrDeltaSec);
          let arrCountdownText = '';
          if (arrAbsSec >= 3600) {
            const h = Math.round(arrAbsSec / 3600);
            arrCountdownText = pluralCount(h, 'hour');
          } else if (arrAbsSec >= 60) {
            const m = Math.round(arrAbsSec / 60);
            arrCountdownText = pluralCount(m, 'minute');
          } else {
            const s = Math.round(arrAbsSec);
            arrCountdownText = pluralCount(s, 'second');
          }
          return (
            <>
              <TimeDisplay
                time={trainData.arriveTime}
                dayOffset={trainData.arriveDayOffset || 0}
                style={[styles.timeText, timeColor && { color: timeColor }]}
                superscriptStyle={[styles.timeSuperscript, timeColor && { color: timeColor }]}
                delayMinutes={aDelay}
                delayedTime={aDelayed?.time}
                delayedDayOffset={aDelayed?.dayOffset}
                hideDelayLabel
              />
              {trainData.daysAway <= 0 && aDelay != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <AnimatedRollingText
                    value={formatDelayStatus(aDelay)}
                    style={[styles.delayStatusText, colorKey === 'delayed' ? styles.delayStatusLate : styles.delayStatusEarly]}
                  />
                  <AnimatedRollingText
                    value={` · ${arrPast ? `Arrived ${arrCountdownText} ago` : `Arrives in ${arrCountdownText}`}`}
                    style={[styles.delayStatusText, styles.countdownInline]}
                  />
                </View>
              )}
            </>
          );
        })()}
      </View>
    </View>
  );
}
