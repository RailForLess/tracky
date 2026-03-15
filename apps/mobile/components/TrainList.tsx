import { light as hapticLight, heavy as hapticHeavy, success as hapticSuccess } from '../utils/haptics';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { type ColorPalette, Spacing } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { PlaceholderBlurb } from './PlaceholderBlurb';
import { createStyles } from '../screens/styles';
import type { Train } from '../types/train';
import TrainCardContent from './TrainCardContent';
import { SlideUpModalContext } from './ui/SlideUpModal';
import { addDelayToTime, parseTimeToDate } from '../utils/time-formatting';
import { getCountdownForTrain } from '../utils/train-display';

// Re-export for backwards compatibility
export { parseTimeToDate, getCountdownForTrain };

const FIRST_THRESHOLD = -80;
const SECOND_THRESHOLD = -200;

interface SwipeableTrainCardProps {
  train: Train;
  onPress: (train: Train) => void;
  onDelete: (train: Train) => void;
  isFirst?: boolean;
  isLast?: boolean;
  contentOpacity?: SharedValue<number>;
}

const SwipeableTrainCard = React.memo(function SwipeableTrainCard({ train, onPress, onDelete, isFirst, isLast, contentOpacity }: SwipeableTrainCardProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sStyles = useMemo(() => createSwipeStyles(colors), [colors]);
  const translateX = useSharedValue(0);
  const hasTriggeredSecondHaptic = useSharedValue(false);
  const isDeleting = useSharedValue(false);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const panDecided = useSharedValue(false);

  const triggerSecondHaptic = () => {
    hapticHeavy();
  };

  const triggerDeleteHaptic = () => {
    hapticSuccess();
  };

  const handleDelete = () => {
    triggerDeleteHaptic();
    onDelete(train);
  };

  const performDelete = () => {
    isDeleting.value = true;
    translateX.value = withTiming(-500, { duration: 200 }, () => {
      runOnJS(handleDelete)();
    });
  };

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event, stateManager) => {
      if (event.numberOfTouches > 1) {
        stateManager.fail();
        return;
      }
      panStartX.value = event.allTouches[0].absoluteX;
      panStartY.value = event.allTouches[0].absoluteY;
      panDecided.value = false;
    })
    .onTouchesMove((event, stateManager) => {
      if (panDecided.value || event.numberOfTouches === 0) return;
      if (event.numberOfTouches > 1) {
        stateManager.fail();
        panDecided.value = true;
        return;
      }
      const dx = event.allTouches[0].absoluteX - panStartX.value;
      const dy = event.allTouches[0].absoluteY - panStartY.value;

      if (Math.abs(dy) > 15) {
        stateManager.fail();
        panDecided.value = true;
        return;
      }
      if (Math.abs(dx) > 10) {
        stateManager.activate();
        panDecided.value = true;
      }
    })
    .onUpdate(event => {
      if (isDeleting.value) return;

      const clampedX = Math.min(0, event.translationX);
      translateX.value = clampedX;

      if (clampedX <= SECOND_THRESHOLD && !hasTriggeredSecondHaptic.value) {
        hasTriggeredSecondHaptic.value = true;
        runOnJS(triggerSecondHaptic)();
      } else if (clampedX > SECOND_THRESHOLD && hasTriggeredSecondHaptic.value) {
        hasTriggeredSecondHaptic.value = false;
      }
    })
    .onEnd(event => {
      if (isDeleting.value) return;

      const fastSwipe = event.velocityX < -800;

      if (translateX.value <= SECOND_THRESHOLD) {
        runOnJS(performDelete)();
      } else if (translateX.value <= FIRST_THRESHOLD || fastSwipe) {
        translateX.value = withSpring(FIRST_THRESHOLD, {
          damping: 50,
          stiffness: 200,
        });
      } else {
        translateX.value = withSpring(0, {
          damping: 50,
          stiffness: 200,
        });
      }
      hasTriggeredSecondHaptic.value = false;
    });

  const triggerLightHaptic = () => {
    hapticLight();
  };

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (isDeleting.value) return;

    if (translateX.value < -10) {
      translateX.value = withSpring(0, {
        damping: 50,
        stiffness: 200,
      });
    } else {
      runOnJS(triggerLightHaptic)();
      runOnJS(onPress)(train);
    }
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const fadeProgress = interpolate(absX, [Math.abs(FIRST_THRESHOLD), Math.abs(SECOND_THRESHOLD)], [1, 0], 'clamp');

    return {
      transform: [{ translateX: translateX.value }],
      opacity: fadeProgress,
    };
  });

  const deleteContainerAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const progress = Math.min(1, absX / Math.abs(FIRST_THRESHOLD));

    return {
      opacity: progress,
      width: absX > 0 ? absX : 0,
    };
  });

  const deleteButtonAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const pastSecondThreshold = absX >= Math.abs(SECOND_THRESHOLD);

    return {
      justifyContent: pastSecondThreshold ? 'flex-start' : 'center',
      paddingLeft: pastSecondThreshold ? 16 : 0,
    };
  });

  const countdown = getCountdownForTrain(train);
  const unitLabel = countdown.unit;
  const isPast = countdown.past;

  const departDelay = train.daysAway <= 0 ? train.realtime?.delay : undefined;
  const arriveDelay = train.daysAway <= 0 ? train.realtime?.arrivalDelay : undefined;
  const departDelayed = departDelay && departDelay > 0
    ? addDelayToTime(train.departTime, departDelay, train.departDayOffset)
    : undefined;
  const arriveDelayed = arriveDelay && arriveDelay > 0
    ? addDelayToTime(train.arriveTime, arriveDelay, train.arriveDayOffset)
    : undefined;

  const firstItemMarginStyle = useAnimatedStyle(() => {
    if (!isFirst || !contentOpacity) {
      return {};
    }
    const marginBottom = interpolate(contentOpacity.value, [0, 1], [100, 0], 'clamp');
    return {
      marginBottom,
    };
  });

  const restItemOpacityStyle = useAnimatedStyle(() => {
    if (isFirst || !contentOpacity) {
      return {};
    }
    return {
      opacity: contentOpacity.value,
    };
  });

  const handleDeletePress = () => {
    performDelete();
  };

  return (
    <Animated.View style={[sStyles.container, firstItemMarginStyle, restItemOpacityStyle]}>
      <Animated.View style={[sStyles.deleteButtonContainer, deleteContainerAnimatedStyle]}>
        <View style={sStyles.deleteButtonWrapper}>
          <GestureDetector gesture={Gesture.Tap().onEnd(() => runOnJS(handleDeletePress)())}>
            <Animated.View style={[sStyles.deleteButton, deleteButtonAnimatedStyle]}>
              <Ionicons name="trash" size={22} color="#fff" />
            </Animated.View>
          </GestureDetector>
        </View>
      </Animated.View>

      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.trainCard, cardAnimatedStyle]}>
          <TrainCardContent
            countdownValue={countdown.value}
            countdownLabel={unitLabel}
            isPast={isPast}
            routeName={train.routeName || train.operator}
            trainNumber={train.trainNumber}
            date={train.date}
            daysAway={train.daysAway}
            fromName={train.from}
            toName={train.to}
            fromCode={train.fromCode}
            toCode={train.toCode}
            departTime={train.departTime}
            arriveTime={train.arriveTime}
            departDayOffset={train.departDayOffset}
            arriveDayOffset={train.arriveDayOffset}
            departDelayMinutes={departDelay}
            departDelayedTime={departDelayed?.time}
            departDelayedDayOffset={departDelayed?.dayOffset}
            arriveDelayMinutes={arriveDelay}
            arriveDelayedTime={arriveDelayed?.time}
            arriveDelayedDayOffset={arriveDelayed?.dayOffset}
            fadeOnlyOnArrival
          />
        </Animated.View>
      </GestureDetector>
      {!isLast && <View style={sStyles.separator} />}
    </Animated.View>
  );
});

export { SwipeableTrainCard };

interface TrainListProps {
  trains: Train[];
  onTrainSelect: (t: Train) => void;
  onDeleteTrain?: (train: Train) => void;
}

const noopDelete = () => {};

export function TrainList({ trains, onTrainSelect, onDeleteTrain }: TrainListProps) {
  const { contentOpacity } = React.useContext(SlideUpModalContext);
  const deleteHandler = onDeleteTrain ?? noopDelete;

  if (trains.length === 0) {
    return (
      <PlaceholderBlurb
        icon="bookmark-outline"
        title="No saved trips yet"
        subtitle="Use the search bar to add a trip"
      />
    );
  }

  return (
    <>
      {trains.map((train, index) => (
        <SwipeableTrainCard
          key={train.id}
          train={train}
          onPress={onTrainSelect}
          onDelete={deleteHandler}
          isFirst={index === 0}
          isLast={index === trains.length - 1}
          contentOpacity={contentOpacity}
        />
      ))}
    </>
  );
}

const createSwipeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: {
      position: 'relative',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border.primary,
    },
    deleteButtonContainer: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'stretch',
      paddingRight: 4,
      paddingLeft: 12,
    },
    deleteButtonWrapper: {
      height: 44,
      flex: 1,
      justifyContent: 'center',
    },
    deleteButton: {
      flex: 1,
      borderRadius: 22,
      backgroundColor: colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
    },
  });
