import { createWidget, type WidgetBase } from 'expo-widgets';
import { Text, VStack, HStack, Spacer, Image } from '@expo/ui/swift-ui';
import { foregroundStyle, font, padding, background, italic, clipShape } from '@expo/ui/swift-ui/modifiers';
import type { NextTrainWidgetData } from '../services/widget-data';

function NextTrainWidgetView(props: WidgetBase<NextTrainWidgetData>) {
  'widget';

  const headline = font({ size: 17, weight: 'semibold' });
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
    // Home screen empty state
    return (
      <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 12 })]}>
        <Image
          systemName="tram.fill"
          size={18}
          color="#FFFFFF"
          modifiers={[frame({ width: 42, height: 42 }), background('#000000'), clipShape('circle')]}
        />
        <Spacer />
        <Text modifiers={[font({ size: 20, weight: 'semibold' })]}>No trains</Text>
        <HStack spacing={5} modifiers={[padding({ top: 4 })]}>
          <Image systemName="plus.circle.fill" size={13} color="#888888" />
          <Text modifiers={[font({ size: 13 }), foregroundStyle('secondary')]}>Tap to add</Text>
        </HStack>
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

  const badgeBg = [padding({ horizontal: 7, vertical: 3 }), background('#88888822'), clipShape('capsule')];

  if (props.family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 12 })]}>
        {/* Header: brand + train number badge */}
        <HStack>
          <Text modifiers={[caption2, foregroundStyle('secondary'), italic()]}>Amtrak</Text>
          <Spacer />
          <HStack spacing={3} modifiers={badgeBg}>
            <Image systemName="arrow.up.right" size={9} />
            <Text modifiers={[caption2, font({ weight: 'medium', size: 11 })]}>#{props.trainNumber}</Text>
          </HStack>
        </HStack>

        <Spacer />

        {/* Identity */}
        <Text modifiers={[font({ size: 13, weight: 'light' }), foregroundStyle('secondary')]}>Train {props.trainNumber}</Text>
        <Text modifiers={[font({ size: 20, weight: 'bold' })]}>to {props.toCode}</Text>

        <Spacer />

        {/* Times */}
        <HStack spacing={4}>
          <Image systemName="arrow.up.right" size={9} />
          <Text modifiers={[caption2, foregroundStyle('secondary')]}>{props.fromCode}</Text>
          <Spacer />
          <Text modifiers={[caption2]}>{props.departTime}</Text>
        </HStack>
        <HStack spacing={4} modifiers={[padding({ top: 3 })]}>
          <Image systemName="arrow.down.right" size={9} color={delayColor} />
          <Text modifiers={[caption2, foregroundStyle('secondary')]}>{props.toCode}</Text>
          <Spacer />
          <Text modifiers={[caption2, foregroundStyle(delayColor)]}>{props.arriveTime}</Text>
        </HStack>
      </VStack>
    );
  }

  // systemMedium (default) — full-width VStack avoids left-side collapse
  return (
    <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 12 })]}>
      {/* Header: brand + badge */}
      <HStack>
        <Text modifiers={[caption2, foregroundStyle('secondary'), italic()]}>Amtrak</Text>
        <Spacer />
        <HStack spacing={3} modifiers={badgeBg}>
          <Image systemName="arrow.up.right" size={9} />
          <Text modifiers={[caption2, font({ weight: 'medium', size: 11 })]}>#{props.trainNumber}</Text>
        </HStack>
      </HStack>

      <Spacer />

      {/* Identity */}
      <Text modifiers={[font({ size: 13, weight: 'light' }), foregroundStyle('secondary')]}>Train {props.trainNumber}</Text>
      <Text modifiers={[font({ size: 22, weight: 'bold' })]}>to {props.toCode}</Text>

      <Spacer />

      {/* Times — full width so times never truncate */}
      <HStack spacing={4}>
        <Image systemName="arrow.up.right" size={9} />
        <Text modifiers={[caption2, foregroundStyle('secondary')]}>{props.fromCode}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>{props.departTime}</Text>
      </HStack>
      <HStack spacing={4} modifiers={[padding({ top: 3 })]}>
        <Image systemName="arrow.down.right" size={9} color={delayColor} />
        <Text modifiers={[caption2, foregroundStyle('secondary')]}>{props.toCode}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(delayColor)]}>{props.arriveTime}</Text>
      </HStack>

      {/* Status footer */}
      <HStack modifiers={[padding({ top: 6 })]}>
        <Text modifiers={[caption2, foregroundStyle(delayColor)]}>{delayLabel}</Text>
        <Spacer />
        {props.daysAway > 0 && (
          <Text modifiers={[caption2, foregroundStyle('secondary')]}>in {props.daysAway}d</Text>
        )}
      </HStack>
    </VStack>
  );
}

export const nextTrainWidget = createWidget<NextTrainWidgetData>('NextTrainWidget', NextTrainWidgetView);
