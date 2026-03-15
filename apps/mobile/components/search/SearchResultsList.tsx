import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Spacing } from '../../constants/theme';
import { TrainIcon } from '../TrainIcon';
import type { Route, SearchResult, Stop, Trip } from '../../types/train';
import type { UnifiedResults, SuggestionItem } from '../TwoStationSearch';

interface SearchResultsListProps {
  // Style & theme
  styles: ReturnType<typeof import('../TwoStationSearch').createStyles>;
  colors: any;

  // Scroll props
  isFullscreen: boolean;
  screenHeight: number;
  keyboardHeight: number;
  panRef: any;
  scrollOffset: any;

  // Search state
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  searchInputRef: React.RefObject<TextInput | null>;
  isDataLoaded: boolean;
  showDatePicker: boolean;

  // Unified results
  unifiedResults: UnifiedResults;
  hasUnifiedResults: boolean;

  // Suggestions
  historySuggestions: SuggestionItem[];
  nearbySuggestions: SuggestionItem[];
  popularSuggestions: SuggestionItem[];

  // Today's train
  todayTrain: { trainNumber: string; fromCode: string; toCode: string; routeName: string } | undefined;

  // Handlers
  onClose: () => void;
  handleSelectStation: (station: Stop) => void;
  handleSelectRoute: (route: Route) => void;
  handleSelectTrain: (trainNumber: string, displayName: string) => void;
  onTodayTripPress: () => void;
  onSuggestionPress: (suggestion: SuggestionItem) => void;

  // Haptics
  hapticLight: () => void;
}

export function SearchResultsList({
  styles,
  colors,
  isFullscreen,
  screenHeight,
  keyboardHeight,
  panRef,
  scrollOffset,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  isDataLoaded,
  showDatePicker,
  unifiedResults,
  hasUnifiedResults,
  historySuggestions,
  nearbySuggestions,
  popularSuggestions,
  todayTrain,
  onClose,
  handleSelectStation,
  handleSelectRoute,
  handleSelectTrain,
  onTodayTripPress,
  onSuggestionPress,
  hapticLight,
}: SearchResultsListProps) {
  const showingSearch = searchQuery.length > 0 && !showDatePicker;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.secondary} />
        <TextInput
          ref={searchInputRef}
          style={styles.fullSearchInput}
          placeholder="Train number, route, or station"
          placeholderTextColor={colors.secondary}
          value={searchQuery}
          onChangeText={text => {
            setSearchQuery(text);
          }}
          autoFocus
        />
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            onClose();
          }}
        >
          <Ionicons name="close-circle" size={20} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      {/* Results */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: (isFullscreen ? 100 : screenHeight * 0.5) + keyboardHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={isFullscreen} waitFor={panRef} bounces={false} onScroll={e => { if (scrollOffset) scrollOffset.value = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>
        {/* Unified search results */}
        {showingSearch && (
          <View style={styles.resultsContainer}>
            {!isDataLoaded ? (
              <Text style={styles.noResults}>Loading...</Text>
            ) : !hasUnifiedResults ? (
              <Text style={styles.noResults}>No results found</Text>
            ) : (
              <>
                {/* STATIONS section */}
                {unifiedResults.stations.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>STATIONS</Text>
                    {unifiedResults.stations.map(result => {
                      const stop = result.data as Stop;
                      return (
                        <TouchableOpacity
                          key={result.id}
                          style={styles.stationItem}
                          onPress={() => handleSelectStation(stop)}
                        >
                          <View style={styles.stationIcon}>
                            <Ionicons name="location" size={20} color={colors.primary} />
                          </View>
                          <View style={styles.stationInfo}>
                            <Text style={styles.stationName}>{result.name}</Text>
                            <Text style={styles.stationCode}>{result.subtitle}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* ROUTES section */}
                {unifiedResults.routes.length > 0 && (
                  <>
                    <Text
                      style={[styles.sectionLabel, unifiedResults.stations.length > 0 && { marginTop: Spacing.lg }]}
                    >
                      ROUTES
                    </Text>
                    {unifiedResults.routes.map(result => {
                      const route = result.data as Route;
                      return (
                        <TouchableOpacity
                          key={result.id}
                          style={styles.stationItem}
                          onPress={() => handleSelectRoute(route)}
                        >
                          <View style={styles.stationIcon}>
                            <Ionicons name="git-branch-outline" size={20} color={colors.primary} />
                          </View>
                          <View style={styles.stationInfo}>
                            <Text style={styles.stationName}>{result.name}</Text>
                            {result.subtitle ? <Text style={styles.stationCode}>{result.subtitle}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* TRAINS section */}
                {unifiedResults.trains.length > 0 && (
                  <>
                    <Text
                      style={[
                        styles.sectionLabel,
                        (unifiedResults.stations.length > 0 || unifiedResults.routes.length > 0) && {
                          marginTop: Spacing.lg,
                        },
                      ]}
                    >
                      TRAINS
                    </Text>
                    {unifiedResults.trains.map(result => {
                      const trip = result.data as Trip;
                      return (
                        <TouchableOpacity
                          key={result.id}
                          style={styles.stationItem}
                          onPress={() => handleSelectTrain(trip.trip_short_name || '', result.name)}
                        >
                          <View style={styles.stationIcon}>
                            <TrainIcon name={result.name} size={20} />
                          </View>
                          <View style={styles.stationInfo}>
                            <Text style={styles.stationName}>{result.name}</Text>
                            {result.subtitle ? <Text style={styles.stationCode}>{result.subtitle}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* Alternatives to my train today */}
        {!showingSearch && todayTrain && (
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionLabel}>TODAY&apos;S TRIP</Text>
            <TouchableOpacity
              style={styles.stationItem}
              onPress={onTodayTripPress}
            >
              <View style={styles.stationIcon}>
                <Ionicons name="git-branch-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.stationInfo}>
                <Text style={styles.stationName}>Alternatives to {todayTrain.trainNumber}</Text>
                <Text style={styles.stationCode}>{todayTrain.fromCode} {'\u2192'} {todayTrain.toCode} {'\u00B7'} {todayTrain.routeName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Suggestion sections when search is empty */}
        {!showingSearch && [
          { key: 'history', label: 'BASED ON YOUR HISTORY', items: historySuggestions },
          { key: 'nearby', label: 'NEARBY', items: nearbySuggestions },
          { key: 'popular', label: 'POPULAR', items: popularSuggestions },
        ].map(section => section.items.length > 0 && (
          <View key={section.key} style={styles.resultsContainer}>
            <Text style={styles.sectionLabel}>{section.label}</Text>
            {section.items.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.stationItem}
                onPress={() => onSuggestionPress(suggestion)}
              >
                <View style={styles.stationIcon}>
                  {suggestion.type === 'train' ? (
                    <TrainIcon name={suggestion.label} size={20} />
                  ) : suggestion.type === 'route' || (suggestion.stop && suggestion.toStop) ? (
                    <Ionicons name="git-branch-outline" size={20} color={colors.primary} />
                  ) : (
                    <Ionicons name="location" size={20} color={colors.primary} />
                  )}
                </View>
                <View style={styles.stationInfo}>
                  <Text style={styles.stationName}>{suggestion.label}</Text>
                  <Text style={styles.stationCode}>{suggestion.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
