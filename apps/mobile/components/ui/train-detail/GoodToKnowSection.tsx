import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { type ColorPalette, Spacing } from '../../../constants/theme';
import { addDelayToTime } from '../../../utils/time-formatting';
import { timeToMinutes } from '../../../utils/time-formatting';
import { getCurrentMinutesInTimezone } from '../../../utils/timezone';
import { convertDistance, distanceSuffix } from '../../../utils/units';
import { light as hapticLight } from '../../../utils/haptics';
import { isThruwayName, TrainIcon } from '../../TrainIcon';
import AnimatedRollingText from '../AnimatedRollingText';
import MarqueeText from '../MarqueeText';
import TimeDisplay from '../TimeDisplay';
import type { GoodToKnowSectionProps, StopInfo } from '../TrainDetailModal';

export default function GoodToKnowSection({
  trainData,
  timezoneInfo,
  weatherData,
  isLoadingWeather,
  tempUnit,
  distanceUnit,
  isWhereIsMyTrainExpanded,
  setIsWhereIsMyTrainExpanded,
  whereIsMyTrainSubtext,
  allStops,
  isLiveTrain,
  nextStopIndex,
  stopDelays,
  stopWeather,
  agencyTz,
  routeHistory,
  styles,
  colors,
  handleStationPress,
}: GoodToKnowSectionProps) {
  return (
    <View style={styles.goodToKnowSection}>
      <Text style={styles.sectionTitle}>Good to Know</Text>

      {/* Timezone Widget */}
      {timezoneInfo && (
        <Animated.View entering={FadeInDown.delay(0).duration(200).easing(Easing.out(Easing.quad))} style={styles.infoCard}>
          <View style={styles.infoCardIcon}>
            <Ionicons name="time-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>
              {timezoneInfo.title}
            </Text>
            <MarqueeText text={timezoneInfo.message} style={styles.infoCardSubtext} />
          </View>
        </Animated.View>
      )}

      {/* Arrival Weather Widget */}
      <Animated.View entering={FadeInDown.delay(100).duration(200).easing(Easing.out(Easing.quad))} style={styles.infoCard}>
        <View style={styles.infoCardIcon}>
          {isLoadingWeather ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : weatherData ? (
            <Ionicons name={weatherData.icon as any} size={24} color={colors.primary} />
          ) : (
            <Ionicons name="partly-sunny-outline" size={24} color={colors.primary} />
          )}
        </View>
        <View style={styles.infoCardContent}>
          <Text style={styles.infoCardTitle}>Arrival Weather</Text>
          <MarqueeText
            text={isLoadingWeather ? 'Loading...' : weatherData ? `${weatherData.temperature}°${tempUnit} and ${weatherData.condition.toLowerCase()}` : 'Weather data unavailable'}
            style={styles.infoCardSubtext}
          />
        </View>
      </Animated.View>

      {/* Where's My Train? */}
      <Animated.View entering={FadeInDown.delay(200).duration(200).easing(Easing.out(Easing.quad))}>
      <TouchableOpacity
        style={styles.historyCard}
        onPress={() => { hapticLight(); setIsWhereIsMyTrainExpanded(!isWhereIsMyTrainExpanded); }}
        activeOpacity={0.7}
      >
        <View style={styles.infoCardRow}>
          <View style={styles.infoCardIcon}>
            <TrainIcon name={trainData?.routeName} size={24} color={colors.primary} />
          </View>
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>{isThruwayName(trainData?.routeName) ? "Where's My Bus?" : "Where's My Train?"}</Text>
            <MarqueeText text={whereIsMyTrainSubtext} style={styles.infoCardSubtext} />
          </View>
          <Ionicons
            name={isWhereIsMyTrainExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.secondary}
            style={{ alignSelf: 'center' }}
          />
        </View>
        {isWhereIsMyTrainExpanded && allStops.length > 0 && (
          <View style={styles.wheresMyTrainContent}>
            <View style={styles.fullRouteTimeline}>
              {allStops.map((stop, index) => {
                const isPast = isLiveTrain && index < nextStopIndex;
                const isCurrent = isLiveTrain && index === nextStopIndex;
                const isOrigin = index === 0;
                const isDest = index === allStops.length - 1;

                // Per-stop delay: use arrivalDelay for last stop, departureDelay for others
                const stopDelayData = trainData.daysAway <= 0 ? stopDelays.get(stop.code) : undefined;
                const stopDelayMin = isDest
                  ? (stopDelayData?.arrivalDelay ?? stopDelayData?.departureDelay)
                  : (stopDelayData?.departureDelay ?? stopDelayData?.arrivalDelay);
                const stopDelayed = stopDelayMin && stopDelayMin > 0
                  ? addDelayToTime(stop.time, stopDelayMin, stop.dayOffset)
                  : undefined;

                return (
                  <View key={index} style={styles.timelineStop}>
                    {!isOrigin && isPast && <View style={[styles.timelineConnector, styles.timelineConnectorPast]} />}
                    {!isOrigin && !isPast && <View style={styles.timelineConnectorGap} />}
                    {isCurrent && !isOrigin && (
                      <View style={styles.timelineTrainPosition}>
                        <TrainIcon name={trainData?.routeName} size={14} color={colors.primary} />
                      </View>
                    )}
                    {!isDest && isPast && <View style={[styles.timelineConnectorBottom, styles.timelineConnectorPast]} />}
                    {!isDest && !isPast && <View style={styles.timelineConnectorBottomGap} />}
                    <View style={styles.timelineStopRow}>
                      <View style={styles.timelineMarker}>
                        <View style={[styles.timelineDot, isPast && styles.timelineDotPast]} />
                      </View>
                      <TouchableOpacity
                        style={styles.timelineStopInfo}
                        onPress={() => handleStationPress(stop.code)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.timelineStopName, isPast && styles.timelineTextPast, isCurrent && styles.timelineTextCurrent]}>
                          {stop.name}
                        </Text>
                        <View style={styles.timelineStopCodeRow}>
                          <Text style={[styles.timelineStopCode, isPast && styles.timelineTextPast, isCurrent && styles.timelineTextCurrent]}>
                            {stop.code}
                          </Text>
                          {stopWeather[stop.code] && (
                            <>
                              <Text style={[styles.timelineStopCode, isPast && styles.timelineTextPast, isCurrent && styles.timelineTextCurrent]}> ·</Text>
                              <Ionicons name={stopWeather[stop.code].icon as any} size={11} color={isCurrent ? '#FFFFFF' : colors.secondary} style={isPast ? { opacity: 0.6 } : undefined} />
                              <AnimatedRollingText value={` ${stopWeather[stop.code].temp}°${tempUnit}`} style={[styles.timelineStopCode, isPast && styles.timelineTextPast, isCurrent && styles.timelineTextCurrent]} />
                            </>
                          )}
                          {isCurrent && (() => {
                            const currentMinutes = getCurrentMinutesInTimezone(agencyTz);
                            const scheduledMinutes = timeToMinutes(stop.time) + stop.dayOffset * 24 * 60;
                            const delayOffset = stopDelayMin && stopDelayMin > 0 ? stopDelayMin : 0;
                            const diffMin = Math.max(0, Math.round(scheduledMinutes + delayOffset - currentMinutes));
                            const arrivalText = diffMin >= 60
                              ? `In ${Math.floor(diffMin / 60)}h${diffMin % 60 > 0 ? `${diffMin % 60}m` : ''}`
                              : `In ${diffMin} min`;
                            return (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.arrivalCountdown}> ·</Text>
                                <AnimatedRollingText value={arrivalText} style={styles.arrivalCountdown} />
                              </View>
                            );
                          })()}
                        </View>
                      </TouchableOpacity>
                      <TimeDisplay
                        time={stop.time}
                        dayOffset={stop.dayOffset}
                        style={{
                          ...styles.timelineStopTime,
                          ...(isPast ? styles.timelineTextPast : {}),
                          ...(isCurrent ? { color: '#FFFFFF', fontWeight: 'bold' as const } : {}),
                        }}
                        superscriptStyle={{
                          ...styles.timelineStopTimeSuperscript,
                          ...(isPast ? styles.timelineTextPast : {}),
                          ...(isCurrent ? { color: '#FFFFFF', fontWeight: 'bold' as const } : {}),
                        }}
                        delayMinutes={stopDelayMin}
                        delayedTime={stopDelayed?.time}
                        delayedDayOffset={stopDelayed?.dayOffset}
                        delayLayout="vertical"
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={styles.weatherNote}>Weather is calculated at each stop's scheduled arrival time.</Text>
          </View>
        )}
      </TouchableOpacity>
      </Animated.View>

      {/* My History on This Route */}
      <Animated.View entering={FadeInDown.delay(300).duration(200).easing(Easing.out(Easing.quad))} style={styles.historyCard}>
        <Text style={[styles.sectionTitle, { marginBottom: Spacing.xs }]}>My History on This Route</Text>
        {trainData && (
          <Text style={styles.historyRouteSubtitle}>{trainData.routeName}</Text>
        )}
        <View style={styles.historyStats}>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Trips</Text>
            <View style={styles.historyStatValueRow}>
              <TrainIcon name={trainData?.routeName} size={14} style={styles.historyStatIcon} />
              <AnimatedRollingText
                value={String(routeHistory && routeHistory.trips > 0 ? routeHistory.trips : 0)}
                style={styles.historyStatValue}
              />
            </View>
          </View>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Distance</Text>
            <View style={styles.historyStatValueRow}>
              <Ionicons name="navigate" size={14} color={colors.primary} style={styles.historyStatIcon} />
              <AnimatedRollingText
                value={routeHistory && routeHistory.trips > 0
                  ? `${Math.round(convertDistance(routeHistory.distance, distanceUnit)).toLocaleString()} ${distanceSuffix(distanceUnit)}`
                  : `0 ${distanceSuffix(distanceUnit)}`}
                style={styles.historyStatValue}
              />
            </View>
          </View>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Travel Time</Text>
            <View style={styles.historyStatValueRow}>
              <Ionicons name="time" size={14} color={colors.primary} style={styles.historyStatIcon} />
              <AnimatedRollingText
                value={routeHistory && routeHistory.trips > 0
                  ? `${Math.floor(routeHistory.duration / 60)}h ${routeHistory.duration % 60}m`
                  : '0m'}
                style={styles.historyStatValue}
              />
            </View>
          </View>
        </View>
        {(!routeHistory || routeHistory.trips === 0) && (
          <Text style={styles.historyEmptyText}>No past rides on this route</Text>
        )}
      </Animated.View>
    </View>
  );
}
