import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { ScrollView } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Spacing } from '../../constants/theme';
import TrainCardContent from '../TrainCardContent';
import { SkeletonBox } from '../ui/SkeletonBox';
import { getTrainDisplayName } from '../../services/api';
import { addDelayToTime } from '../../utils/time-formatting';
import { convertGtfsTimeForStop } from '../../utils/timezone';
import { pluralCount } from '../../utils/train-display';
import type { Stop, EnrichedStopTime } from '../../types/train';
import type { TripResult } from '../TwoStationSearch';
import { getCountdownFromDeparture } from '../TwoStationSearch';

interface StationFlowViewProps {
  // Style & theme
  styles: ReturnType<typeof import('../TwoStationSearch').createStyles>;
  colors: any;

  // Scroll props
  isFullscreen: boolean;
  screenHeight: number;
  keyboardHeight: number;
  panRef: any;
  scrollOffset: any;

  // State
  fromStation: Stop;
  toStation: Stop | null;
  selectedDate: Date | null;
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  searchInputRef: React.RefObject<TextInput | null>;
  isDataLoaded: boolean;
  showDatePicker: boolean;
  stationResults: Stop[];
  tripResults: TripResult[];
  loadingTrips: boolean;
  tripDelays: Map<string, { departDelay?: number; arriveDelay?: number }>;

  // Calendar
  calendarTheme: any;
  calendarMarkedDates: any;

  // Handlers
  handleClearFrom: () => void;
  handleClearTo: () => void;
  handleClearDate: () => void;
  handleSelectStation: (station: Stop) => void;
  handleDayPress: (day: DateData) => void;
  onSelectTrip: (tripId: string, fromCode: string, toCode: string, date: Date) => void;

  // Formatting & haptics
  formatDateForPill: (date: Date) => string;
  hapticSuccess: () => void;
}

export function StationFlowView({
  styles,
  colors,
  isFullscreen,
  screenHeight,
  keyboardHeight,
  panRef,
  scrollOffset,
  fromStation,
  toStation,
  selectedDate,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  isDataLoaded,
  showDatePicker,
  stationResults,
  tripResults,
  loadingTrips,
  tripDelays,
  calendarTheme,
  calendarMarkedDates,
  handleClearFrom,
  handleClearTo,
  handleClearDate,
  handleSelectStation,
  handleDayPress,
  onSelectTrip,
  formatDateForPill,
  hapticSuccess,
}: StationFlowViewProps) {
  const from = fromStation;
  const showingResults = from && toStation && selectedDate;
  const showingStationSearch = !showingResults && searchQuery.length > 0 && !showDatePicker;
  const showingDatePicker = from && toStation && !selectedDate;

  return (
    <View style={styles.container}>
      {/* Segment row */}
      <View style={styles.segmentRow}>
        {/* From segment */}
        <TouchableOpacity style={styles.segment} onPress={handleClearFrom}>
          <Text style={styles.segmentText}>{from.stop_id}</Text>
        </TouchableOpacity>

        {/* To segment: input or filled */}
        {toStation ? (
          <TouchableOpacity style={styles.segment} onPress={handleClearTo}>
            <Text style={styles.segmentText}>{toStation.stop_id}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.segment, styles.segmentInput]}>
            <TextInput
              ref={searchInputRef}
              style={styles.segmentTextInput}
              placeholder="Enter arrival station"
              placeholderTextColor={colors.secondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>
        )}

        {/* Date segment: placeholder when toStation set but no date */}
        {toStation && !selectedDate && (
          <View style={[styles.segment, styles.segmentDatePlaceholder]}>
            <Ionicons name="calendar-outline" size={14} color={colors.secondary} />
            <Text style={[styles.segmentText, { color: colors.secondary }]}>Select date</Text>
          </View>
        )}

        {/* Date segment: filled when date is selected */}
        {selectedDate && (
          <TouchableOpacity style={[styles.segment, styles.segmentDate]} onPress={handleClearDate}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={styles.segmentText}>{formatDateForPill(selectedDate)}</Text>
          </TouchableOpacity>
        )}

      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: (isFullscreen ? 100 : screenHeight * 0.5) + keyboardHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={isFullscreen} waitFor={panRef} bounces={false} onScroll={e => { if (scrollOffset) scrollOffset.value = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
        {/* Station Search Results (for arrival) */}
        {showingStationSearch && (
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionLabel}>SELECT ARRIVAL STATION</Text>
            {!isDataLoaded ? (
              <Text style={styles.noResults}>Loading...</Text>
            ) : stationResults.length === 0 ? (
              <Text style={styles.noResults}>No stations found</Text>
            ) : (
              stationResults.map(station => (
                <TouchableOpacity
                  key={station.stop_id}
                  style={styles.stationItem}
                  onPress={() => handleSelectStation(station)}
                >
                  <View style={styles.stationIcon}>
                    <Ionicons name="location" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.stationInfo}>
                    <Text style={styles.stationName}>{station.stop_name}</Text>
                    <Text style={styles.stationCode}>{station.stop_id}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Date Picker Section */}
        {showingDatePicker && (
          <View style={styles.datePickerContainer}>
            <Text style={styles.sectionLabel}>SELECT TRAVEL DATE</Text>
            {[
              { label: 'Today', offset: 0 },
              { label: 'Tomorrow', offset: 1 },
            ].map(({ label, offset }) => {
              const d = new Date();
              d.setDate(d.getDate() + offset);
              return (
                <TouchableOpacity key={label} style={styles.stationItem} onPress={() => handleDayPress({ dateString: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, day: d.getDate(), month: d.getMonth()+1, year: d.getFullYear(), timestamp: d.getTime() })}>
                  <View style={styles.stationIcon}>
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.stationInfo}>
                    <Text style={styles.stationName}>{label}</Text>
                    <Text style={styles.stationCode}>{formatDateForPill(d)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
                </TouchableOpacity>
              );
            })}
            <View style={styles.datePickerWrapper}>
              <Calendar
                theme={calendarTheme}
                markedDates={calendarMarkedDates}
                onDayPress={handleDayPress}
                hideExtraDays
                enableSwipeMonths
              />
            </View>
          </View>
        )}

        {/* Trip Results */}
        {showingResults && (
          <View style={styles.resultsContainer}>
            {loadingTrips ? (
              <View>
                <SkeletonBox width={120} height={14} borderRadius={4} style={{ marginBottom: Spacing.md }} />
                {[0, 1, 2].map((i) => (
                  <View key={i}>
                    <View style={{ flexDirection: 'row', paddingVertical: 12 }}>
                      <View style={{ width: 52, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <SkeletonBox width={40} height={36} borderRadius={8} />
                        <SkeletonBox width={30} height={12} borderRadius={4} style={{ marginTop: 4 }} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <SkeletonBox width={100} height={14} borderRadius={4} />
                        <SkeletonBox width="80%" height={18} borderRadius={4} style={{ marginTop: 6 }} />
                        <View style={{ flexDirection: 'row', marginTop: 6, gap: 16 }}>
                          <SkeletonBox width={60} height={13} borderRadius={4} />
                          <SkeletonBox width={60} height={13} borderRadius={4} />
                        </View>
                      </View>
                    </View>
                    {i < 2 && <View style={styles.tripCardSeparator} />}
                  </View>
                ))}
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>
                  {pluralCount(tripResults.length, 'TRAIN')} FOUND
                </Text>
                {tripResults.length === 0 ? (
                  <Text style={styles.noResults}>No direct trains between these stations</Text>
                ) : (
              [...tripResults].sort((a, b) => {
                const now = Date.now();
                const getDepMs = (dep: string) => {
                  const [h, m] = dep.split(':').map(Number);
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + Math.floor(h / 24));
                  d.setHours(h % 24, m, 0, 0);
                  return d.getTime();
                };
                const aMs = getDepMs(a.fromStop.departure_time);
                const bMs = getDepMs(b.fromStop.departure_time);
                const aFuture = aMs >= now;
                const bFuture = bMs >= now;
                // Future trains first, sorted by soonest departure
                if (aFuture && bFuture) return aMs - bMs;
                if (aFuture && !bFuture) return -1;
                if (!aFuture && bFuture) return 1;
                // Past trains sorted by most recent first (closest to now)
                return bMs - aMs;
              }).map((trip, index) => {
                const { displayName, routeName } = getTrainDisplayName(trip.tripId);
                const isLast = index === tripResults.length - 1;
                const delays = tripDelays.get(trip.tripId);
                const depDelay = delays?.departDelay;
                const countdown = getCountdownFromDeparture(trip.fromStop.departure_time, selectedDate, depDelay);
                const countdownLabel = countdown.unit;
                const depart = convertGtfsTimeForStop(trip.fromStop.departure_time, trip.fromStop.stop_id);
                const arrive = convertGtfsTimeForStop(trip.toStop.arrival_time, trip.toStop.stop_id);
                const arrDelay = delays?.arriveDelay;
                const depDelayed = depDelay && depDelay > 0 ? addDelayToTime(depart.time, depDelay, depart.dayOffset) : undefined;
                const arrDelayed = arrDelay && arrDelay > 0 ? addDelayToTime(arrive.time, arrDelay, arrive.dayOffset) : undefined;
                return (
                  <TouchableOpacity
                    key={trip.tripId}
                    style={styles.tripCard}
                    onPress={() => {
                      hapticSuccess();
                      onSelectTrip(trip.tripId, from.stop_id, toStation!.stop_id, selectedDate);
                    }}
                  >
                    <TrainCardContent
                      countdownValue={countdown.value}
                      countdownLabel={countdownLabel}
                      isPast={countdown.past}
                      routeName={routeName || ''}
                      trainNumber={displayName.replace(routeName || '', '').trim()}
                      fromName={from.stop_name}
                      toName={toStation!.stop_name}
                      fromCode={from.stop_id}
                      toCode={toStation!.stop_id}
                      departTime={depart.time}
                      arriveTime={arrive.time}
                      departDayOffset={depart.dayOffset}
                      arriveDayOffset={arrive.dayOffset}
                      intermediateStopCount={trip.intermediateStops.length}
                      departDelayMinutes={depDelay}
                      departDelayedTime={depDelayed?.time}
                      departDelayedDayOffset={depDelayed?.dayOffset}
                      arriveDelayMinutes={arrDelay}
                      arriveDelayedTime={arrDelayed?.time}
                      arriveDelayedDayOffset={arrDelayed?.dayOffset}
                    />
                    {!isLast && <View style={styles.tripCardSeparator} />}
                  </TouchableOpacity>
                );
              })
            )}
              </>
            )}
          </View>
        )}

        {/* Hint when from is selected but no to search */}
        {!showingStationSearch && !showingResults && !showingDatePicker && searchQuery.length === 0 && !toStation && (
          <View style={styles.hintContainer}>
            <Ionicons name="information-circle-outline" size={20} color={colors.secondary} />
            <Text style={styles.hintText}>Now enter your arrival station</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
