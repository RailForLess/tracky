import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { ScrollView } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Spacing } from '../../constants/theme';
import { TrainIcon } from '../TrainIcon';
import { formatTime } from '../../utils/time-formatting';
import type { EnrichedStopTime } from '../../types/train';
import type { RouteTrainItem } from '../TwoStationSearch';

interface TrainFlowViewProps {
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
  selectedTrainNumber: string | null;
  selectedTrainName: string;
  expandedRouteTrains: RouteTrainItem[] | null;
  expandedRouteName: string;
  selectedDate: Date | null;
  resolvedTripId: string | null;
  trainStops: EnrichedStopTime[];
  selectedFromStop: EnrichedStopTime | null;
  trainNotRunning: boolean;
  routeFilterQuery: string;
  setRouteFilterQuery: (text: string) => void;
  filterLiveOnly: boolean;
  liveTrainNumbers: Set<string>;
  searchInputRef: React.RefObject<TextInput | null>;

  // Calendar
  calendarTheme: any;
  calendarMarkedDates: any;
  calendarMinDate: string;
  calendarMaxDate: string | undefined;

  // Handlers
  handleClearTrain: () => void;
  handleClearDate: () => void;
  handleSelectTrain: (trainNumber: string, displayName: string) => void;
  handleSelectTrainStop: (stop: EnrichedStopTime) => void;
  handleDayPress: (day: DateData) => void;
  onFilterLiveToggle: () => void;

  // Formatting
  formatDateForPill: (date: Date) => string;
}

export function TrainFlowView({
  styles,
  colors,
  isFullscreen,
  screenHeight,
  keyboardHeight,
  panRef,
  scrollOffset,
  selectedTrainNumber,
  selectedTrainName,
  expandedRouteTrains,
  expandedRouteName,
  selectedDate,
  resolvedTripId,
  trainStops,
  selectedFromStop,
  trainNotRunning,
  routeFilterQuery,
  setRouteFilterQuery,
  filterLiveOnly,
  liveTrainNumbers,
  searchInputRef,
  calendarTheme,
  calendarMarkedDates,
  calendarMinDate,
  calendarMaxDate,
  handleClearTrain,
  handleClearDate,
  handleSelectTrain,
  handleSelectTrainStop,
  handleDayPress,
  onFilterLiveToggle,
  formatDateForPill,
}: TrainFlowViewProps) {
  const isRouteMode = !!expandedRouteTrains && !selectedTrainNumber;
  const showingTrainDatePicker = !isRouteMode && !selectedDate;
  const showingStopList = !isRouteMode && resolvedTripId && trainStops.length > 0;

  return (
    <View style={styles.container}>
      {/* Segment row */}
      <View style={styles.segmentRow}>
        {/* Left segment: Route or Train */}
        <TouchableOpacity
          style={[styles.segment, { flexShrink: 1 }]}
          onPress={handleClearTrain}
        >
          <TrainIcon name={isRouteMode ? expandedRouteName : selectedTrainName} size={14} />
          <Text style={styles.segmentText} numberOfLines={1}>
            {isRouteMode ? expandedRouteName : (selectedTrainName || `Train ${selectedTrainNumber}`)}
          </Text>
        </TouchableOpacity>

        {/* Right segment: Input (route mode) or Date (train mode) */}
        {isRouteMode ? (
          <View style={[styles.segment, styles.segmentInput]}>
            <TextInput
              ref={searchInputRef}
              style={styles.segmentTextInput}
              placeholder="Enter number"
              placeholderTextColor={colors.secondary}
              value={routeFilterQuery}
              onChangeText={setRouteFilterQuery}
              autoFocus
              keyboardType="number-pad"
            />
          </View>
        ) : !selectedDate ? (
          <View style={[styles.segment, styles.segmentDatePlaceholder]}>
            <Ionicons name="calendar-outline" size={14} color={colors.secondary} />
            <Text style={[styles.segmentText, { color: colors.secondary }]}>Select date</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.segment, styles.segmentDate]} onPress={handleClearDate}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={styles.segmentText}>{formatDateForPill(selectedDate)}</Text>
          </TouchableOpacity>
        )}

      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: (isFullscreen ? 100 : screenHeight * 0.5) + keyboardHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={isFullscreen} waitFor={panRef} bounces={false} onScroll={e => { if (scrollOffset) scrollOffset.value = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
        {/* Route mode: filtered train list */}
        {isRouteMode && expandedRouteTrains && (
          <View>
            <View style={[styles.sectionHeaderRow, { marginBottom: Spacing.xl }]}>
              <Text style={[styles.sectionLabel, { marginBottom: 0, flex: 1 }]}>{expandedRouteName.toUpperCase()} TRAINS</Text>
              <TouchableOpacity
                style={[styles.liveFilterBadge, filterLiveOnly && styles.liveFilterBadgeActive]}
                onPress={onFilterLiveToggle}
              >
                <View style={[styles.liveFilterDot, filterLiveOnly && styles.liveFilterDotActive]} />
                <Text style={[styles.liveFilterText, filterLiveOnly && styles.liveFilterTextActive]}>En Route</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.resultsContainer}>
              {expandedRouteTrains.filter(train => {
                if (filterLiveOnly && !liveTrainNumbers.has(train.trainNumber)) return false;
                if (routeFilterQuery.length > 0) {
                  const q = routeFilterQuery.toLowerCase();
                  return train.trainNumber.toLowerCase().includes(q)
                    || train.displayName.toLowerCase().includes(q)
                    || (train.headsign && train.headsign.toLowerCase().includes(q))
                    || (train.endpointLabel && train.endpointLabel.toLowerCase().includes(q));
                }
                return true;
              }).map(train => {
                const isLive = liveTrainNumbers.has(train.trainNumber);
                const subtitle = train.endpointLabel || train.headsign;
                return (
                  <TouchableOpacity
                    key={train.trainNumber}
                    style={styles.stationItem}
                    onPress={() => handleSelectTrain(train.trainNumber, train.displayName)}
                  >
                    <View style={styles.stationIcon}>
                      <TrainIcon name={train.displayName} size={20} />
                    </View>
                    <View style={styles.stationInfo}>
                      <Text style={styles.stationName}>{train.displayName}</Text>
                      {subtitle ? (
                        <Text style={styles.stationCode}>
                          {subtitle}
                          {isLive ? <Text style={styles.liveIndicator}> {'\u00B7'} En Route</Text> : null}
                        </Text>
                      ) : isLive ? (
                        <Text style={styles.liveIndicator}>En Route</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Date picker (train mode) */}
        {!isRouteMode && showingTrainDatePicker && (
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
                minDate={calendarMinDate}
                maxDate={calendarMaxDate}
                onDayPress={handleDayPress}
                hideExtraDays
                enableSwipeMonths
              />
            </View>
          </View>
        )}

        {/* Train doesn't run message */}
        {!isRouteMode && trainNotRunning && selectedDate && (
          <View style={styles.hintContainer}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={[styles.hintText, { color: colors.error }]}>
              This train does not run on {formatDateForPill(selectedDate)}
            </Text>
          </View>
        )}

        {/* Stop list -- pick boarding and destination */}
        {showingStopList && (
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionLabel}>
              {!selectedFromStop ? 'SELECT BOARDING STOP' : 'SELECT DESTINATION STOP'}
            </Text>
            {trainStops.map((stop, index) => {
              const isBeforeFrom = selectedFromStop && stop.stop_sequence < selectedFromStop.stop_sequence;
              const isFrom =
                selectedFromStop?.stop_id === stop.stop_id && selectedFromStop?.stop_sequence === stop.stop_sequence;
              const isDimmed = selectedFromStop && !isFrom && isBeforeFrom;
              const isOrigin = index === 0;
              const isDest = index === trainStops.length - 1;

              return (
                <TouchableOpacity
                  key={`${stop.stop_id}-${stop.stop_sequence}`}
                  style={[styles.stopItem, isDimmed && styles.stopItemDimmed]}
                  onPress={() => handleSelectTrainStop(stop)}
                >
                  {/* Absolute-positioned connector lines */}
                  {!isOrigin && <View style={styles.stopConnectorTop} />}
                  {!isDest && <View style={styles.stopConnectorBottom} />}

                  {/* Stop row content */}
                  <View style={styles.stopRow}>
                    <View style={styles.stopMarker}>
                      <View style={[styles.stopDot, isFrom && styles.stopDotSelected]} />
                    </View>

                    <View style={styles.stopInfo}>
                      <Text style={[styles.stopName, isDimmed && styles.stopTextDimmed]}>{stop.stop_name}</Text>
                      <Text style={[styles.stopTime, isDimmed && styles.stopTextDimmed]}>
                        {isOrigin
                          ? `Departs ${formatTime(stop.departure_time)}`
                          : isDest
                            ? `Arrives ${formatTime(stop.arrival_time)}`
                            : `${formatTime(stop.arrival_time)} — ${formatTime(stop.departure_time)}`}
                      </Text>
                    </View>

                    <Text style={[styles.stopCode, isDimmed && styles.stopTextDimmed]}>{stop.stop_code}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
