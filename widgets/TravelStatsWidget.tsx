import { createWidget, type WidgetBase } from 'expo-widgets';
import type { TravelStatsWidgetData } from '../services/widget-data';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TravelStatsWidgetView(props: WidgetBase<TravelStatsWidgetData>) {
  'widget';

  const { Text, VStack, HStack, Spacer } = require('@expo/ui/swift-ui');
  const { foregroundStyle, font, padding } = require('@expo/ui/swift-ui/modifiers');

  const headline = font({ size: 17, weight: 'semibold' });
  const subheadline = font({ size: 15 });
  const title1 = font({ size: 28, weight: 'bold' });
  const title2 = font({ size: 22, weight: 'bold' });
  const title3 = font({ size: 20, weight: 'semibold' });
  const caption = font({ size: 12 });
  const caption2 = font({ size: 11 });

  if (!props.hasTrips) {
    if (props.family === 'accessoryCircular') {
      return (
        <VStack spacing={1}>
          <Text modifiers={[headline]}>0</Text>
          <Text modifiers={[caption2]}>trips</Text>
        </VStack>
      );
    }
    return (
      <VStack spacing={4}>
        <Text modifiers={[headline]}>No trips yet</Text>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>Complete a trip to see stats</Text>
      </VStack>
    );
  }

  // --- Lock screen accessory widgets ---

  if (props.family === 'accessoryCircular') {
    return (
      <VStack spacing={1}>
        <Text modifiers={[headline]}>{props.totalTrips}</Text>
        <Text modifiers={[caption2, foregroundStyle('secondary')]}>trips</Text>
      </VStack>
    );
  }

  // --- Home screen widgets ---

  if (props.family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>Travel Stats</Text>
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={[title1]}>{props.totalTrips}</Text>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>trips</Text>
        </VStack>
        <Spacer />
        <Text modifiers={[subheadline]}>{props.totalDistanceMiles.toLocaleString()} mi</Text>
      </VStack>
    );
  }

  if (props.family === 'systemLarge') {
    return (
      <VStack alignment="leading" spacing={12} modifiers={[padding({ all: 16 })]}>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>Travel Stats</Text>

        {/* 2x2 stat grid */}
        <HStack spacing={16}>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[title1]}>{props.totalTrips}</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>trips</Text>
          </VStack>
          <Spacer />
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[title1]}>{props.uniqueStations}</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>stations</Text>
          </VStack>
        </HStack>
        <HStack spacing={16}>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[title2]}>{props.totalDistanceMiles.toLocaleString()} mi</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>distance</Text>
          </VStack>
          <Spacer />
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[title2]}>{formatDuration(props.totalDurationMinutes)}</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>travel time</Text>
          </VStack>
        </HStack>

        <Spacer />

        {/* Favorite route */}
        {props.favoriteRoute ? (
          <HStack>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>Favorite route</Text>
            <Spacer />
            <Text modifiers={[subheadline]}>{props.favoriteRoute}</Text>
          </HStack>
        ) : null}
      </VStack>
    );
  }

  // systemMedium (default)
  return (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[caption, foregroundStyle('secondary')]}>Travel Stats</Text>
      <HStack spacing={16}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[title2]}>{props.totalTrips}</Text>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>trips</Text>
        </VStack>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[title2]}>{props.totalDistanceMiles.toLocaleString()} mi</Text>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>distance</Text>
        </VStack>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[title2]}>{props.uniqueStations}</Text>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>stations</Text>
        </VStack>
      </HStack>
      <HStack>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>
          {formatDuration(props.totalDurationMinutes)} total
        </Text>
        <Spacer />
        {props.favoriteRoute ? (
          <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.favoriteRoute}</Text>
        ) : null}
      </HStack>
    </VStack>
  );
}

export const travelStatsWidget = createWidget<TravelStatsWidgetData>(
  'TravelStatsWidget',
  TravelStatsWidgetView
);
