import { createWidget, type WidgetBase } from 'expo-widgets';
import type { UpcomingTrainsWidgetData } from '../services/widget-data';

function UpcomingTrainsWidgetView(props: WidgetBase<UpcomingTrainsWidgetData>) {
  'widget';

  const { Text, VStack, HStack, Spacer } = require('@expo/ui/swift-ui');
  const { foregroundStyle, font, padding, frame } = require('@expo/ui/swift-ui/modifiers');

  const headline = font({ size: 17, weight: 'semibold' });
  const subheadline = font({ size: 15 });
  const body = font({ size: 14 });
  const caption = font({ size: 12 });
  const caption2 = font({ size: 11 });

  if (props.count === 0) {
    return (
      <VStack spacing={4} modifiers={[padding({ all: 16 })]}>
        <Text modifiers={[headline]}>No upcoming trains</Text>
        <Text modifiers={[caption, foregroundStyle('secondary')]}>Save a train to see it here</Text>
      </VStack>
    );
  }

  function TrainRow({ trainNumber, fromCode, toCode, departTime, arriveTime, delayMinutes, status }: {
    trainNumber: string; fromCode: string; toCode: string;
    departTime: string; arriveTime: string; delayMinutes: number; status: string;
  }) {
    const delayColor = delayMinutes > 0 ? '#EF4444' : '#22C55E';
    const delayLabel = delayMinutes > 0 ? `+${delayMinutes}m` : delayMinutes < 0 ? `${delayMinutes}m` : 'On Time';

    return (
      <HStack spacing={8}>
        <VStack alignment="leading" spacing={2} modifiers={[frame({ minWidth: 44 })]}>
          <Text modifiers={[caption, foregroundStyle('secondary')]}>#{trainNumber}</Text>
          <Text modifiers={[body]}>{fromCode}→{toCode}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[subheadline]}>{departTime}</Text>
          <Text modifiers={[caption2, foregroundStyle(delayColor)]}>{delayLabel}</Text>
        </VStack>
      </HStack>
    );
  }

  // systemLarge
  return (
    <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 })]}>
      <HStack>
        <Text modifiers={[headline]}>Upcoming Trains</Text>
        <Spacer />
        <Text modifiers={[caption, foregroundStyle('secondary')]}>{props.count} train{props.count !== 1 ? 's' : ''}</Text>
      </HStack>

      {props.count >= 1 && (
        <TrainRow
          trainNumber={props.t0_trainNumber} fromCode={props.t0_fromCode} toCode={props.t0_toCode}
          departTime={props.t0_departTime} arriveTime={props.t0_arriveTime}
          delayMinutes={props.t0_delayMinutes} status={props.t0_status}
        />
      )}
      {props.count >= 2 && (
        <TrainRow
          trainNumber={props.t1_trainNumber} fromCode={props.t1_fromCode} toCode={props.t1_toCode}
          departTime={props.t1_departTime} arriveTime={props.t1_arriveTime}
          delayMinutes={props.t1_delayMinutes} status={props.t1_status}
        />
      )}
      {props.count >= 3 && (
        <TrainRow
          trainNumber={props.t2_trainNumber} fromCode={props.t2_fromCode} toCode={props.t2_toCode}
          departTime={props.t2_departTime} arriveTime={props.t2_arriveTime}
          delayMinutes={props.t2_delayMinutes} status={props.t2_status}
        />
      )}
      {props.count >= 4 && (
        <TrainRow
          trainNumber={props.t3_trainNumber} fromCode={props.t3_fromCode} toCode={props.t3_toCode}
          departTime={props.t3_departTime} arriveTime={props.t3_arriveTime}
          delayMinutes={props.t3_delayMinutes} status={props.t3_status}
        />
      )}

      <Spacer />
      {props.moreCount > 0 && (
        <Text modifiers={[caption, foregroundStyle('secondary')]}>+{props.moreCount} more</Text>
      )}
    </VStack>
  );
}

export const upcomingTrainsWidget = createWidget<UpcomingTrainsWidgetData>(
  'UpcomingTrainsWidget',
  UpcomingTrainsWidgetView
);
