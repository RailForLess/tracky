import { createWidget, type WidgetBase } from 'expo-widgets';
import type { NextTrainWidgetData } from '../services/widget-data';

function NextTrainWidgetView(props: WidgetBase<NextTrainWidgetData>) {
  'widget';

  const { Text, VStack, HStack, Spacer, Image } = require('@expo/ui/swift-ui');
  const { foregroundStyle, font, padding, frame } = require('@expo/ui/swift-ui/modifiers');

  const headline = font({ size: 17, weight: 'semibold' });
  const subheadline = font({ size: 15 });
  const title1 = font({ size: 28, weight: 'bold' });
  const title2 = font({ size: 22, weight: 'bold' });
  const title3 = font({ size: 20, weight: 'semibold' });
  const body = font({ size: 14 });
  const caption = font({ size: 12 });
  const caption2 = font({ size: 11 });

  if (!props.hasTrains) {
    // Lock screen accessory empty states are smaller
    if (props.family === 'accessoryInline') {
      return <Text>No trains</Text>;
    }
    if (props.family === 'accessoryCircular') {
      return (
        <VStack spacing={1}>
          <Text modifiers={[caption2]}>--</Text>
          <Text modifiers={[caption2]}>No train</Text>
        </VStack>
      );
    }
    if (props.family === 'accessoryRectangular') {
      return (
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[caption]}>No upcoming trains</Text>
          <Text modifiers={[caption2, foregroundStyle('secondary')]}>Save a train to see it here</Text>
        </VStack>
      );
    }
    return (
      <VStack spacing={4}>
        <Text modifiers={[headline]}>No upcoming trains</Text>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>Save a train to see it here</Text>
      </VStack>
    );
  }

  const delayColor = props.delayMinutes > 0 ? '#EF4444' : '#22C55E';
  const delayLabel =
    props.delayMinutes > 0
      ? `+${props.delayMinutes}m`
      : props.delayMinutes < 0
        ? `${props.delayMinutes}m`
        : 'On Time';

  // --- Lock screen accessory widgets ---

  if (props.family === 'accessoryInline') {
    return (
      <HStack spacing={4}>
        <Image systemName="tram.fill" />
        <Text>{props.fromCode}→{props.toCode} {delayLabel}</Text>
      </HStack>
    );
  }

  if (props.family === 'accessoryCircular') {
    return (
      <VStack spacing={1}>
        <Text modifiers={[caption2, foregroundStyle('secondary')]}>{props.fromCode}</Text>
        <Text modifiers={[headline]}>{props.departTime}</Text>
        {props.delayMinutes !== 0 && (
          <Text modifiers={[caption2, foregroundStyle('secondary')]}>{delayLabel}</Text>
        )}
      </VStack>
    );
  }

  if (props.family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2}>
        <HStack spacing={4}>
          <Text modifiers={[caption]}>#{props.trainNumber}</Text>
          {props.delayMinutes !== 0 && (
            <Text modifiers={[caption, foregroundStyle('secondary')]}>{delayLabel}</Text>
          )}
        </HStack>
        <Text modifiers={[body]}>{props.fromCode}→{props.toCode}</Text>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.departTime}</Text>
      </VStack>
    );
  }

  // --- Home screen widgets ---

  if (props.family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 12 })]}>
        <HStack spacing={4}>
          <Text modifiers={[headline]}>{props.fromCode}</Text>
          <Text modifiers={[foregroundStyle('secondary')]}>-</Text>
          <Text modifiers={[headline]}>{props.toCode}</Text>
        </HStack>
        <Text modifiers={[title2]}>{props.departTime}</Text>
        <Spacer />
        <Text modifiers={[caption, foregroundStyle(delayColor)]}>{delayLabel}</Text>
        {props.daysAway > 0 && (
          <Text modifiers={[caption2, foregroundStyle('secondary')]}>in {props.daysAway}d</Text>
        )}
      </VStack>
    );
  }

  if (props.family === 'systemLarge') {
    return (
      <VStack alignment="leading" spacing={12} modifiers={[padding({ all: 16 })]}>
        {/* Header */}
        <HStack>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>Next Train</Text>
          <Spacer />
          {props.daysAway > 0 && (
            <Text modifiers={[caption, foregroundStyle('secondary')]}>in {props.daysAway}d</Text>
          )}
        </HStack>

        {/* Route visual */}
        <HStack spacing={12}>
          <VStack alignment="center" spacing={4}>
            <Text modifiers={[title1]}>{props.fromCode}</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>Departs</Text>
            <Text modifiers={[title3]}>{props.departTime}</Text>
          </VStack>
          <Spacer />
          <VStack spacing={4}>
            <Text modifiers={[foregroundStyle('secondary')]}>→</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.routeName}</Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={4}>
            <Text modifiers={[title1]}>{props.toCode}</Text>
            <Text modifiers={[caption, foregroundStyle('secondary')]}>Arrives</Text>
            <Text modifiers={[title3]}>{props.arriveTime}</Text>
          </VStack>
        </HStack>

        {/* Train info */}
        <HStack>
          <Text modifiers={[subheadline]}>Train {props.trainNumber}</Text>
          <Spacer />
        </HStack>

        <Spacer />

        {/* Delay badge */}
        <HStack>
          <Spacer />
          <Text modifiers={[title2, foregroundStyle(delayColor)]}>{delayLabel}</Text>
          <Spacer />
        </HStack>
      </VStack>
    );
  }

  // systemMedium (default)
  return (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 12 })]}>
      <HStack>
        <Text modifiers={[headline]}>Train {props.trainNumber}</Text>
        <Spacer />
        <Text modifiers={[subheadline, foregroundStyle(delayColor)]}>{delayLabel}</Text>
      </HStack>
      <HStack spacing={8}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[title3]}>{props.fromCode}</Text>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.departTime}</Text>
        </VStack>
        <Spacer />
        <Text modifiers={[foregroundStyle('secondary')]}>→</Text>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[title3]}>{props.toCode}</Text>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.arriveTime}</Text>
        </VStack>
      </HStack>
      <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.routeName}</Text>
    </VStack>
  );
}

export const nextTrainWidget = createWidget<NextTrainWidgetData>('NextTrainWidget', NextTrainWidgetView);
