import { light as hapticLight, heavy as hapticHeavy, success as hapticSuccess } from '../utils/haptics';
import React from 'react';
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
import { AppColors, Spacing } from '../constants/theme';
import { PlaceholderBlurb } from './PlaceholderBlurb';
import { styles } from '../screens/styles';
import type { Train } from '../types/train';
import TrainCardContent from './TrainCardContent';
import { SlideUpModalContext } from './ui/slide-up-modal';
import { addDelayToTime, parseTimeToDate } from '../utils/time-formatting';
import { getCountdownForTrain } from '../utils/train-display';

// Re-export for backwards compatibility
export { parseTimeToDate, getCountdownForTrain };

// First threshold - shows delete button
const FIRST_THRESHOLD = -80;
// Second threshold - triggers auto-delete on release
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

      // Only allow left swipe (negative values), no max limit
      const clampedX = Math.min(0, event.translationX);
      translateX.value = clampedX;

      // Haptic only when crossing second threshold (auto-delete point)
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

      // If past second threshold, auto-delete
      if (translateX.value <= SECOND_THRESHOLD) {
        runOnJS(performDelete)();
      } else if (translateX.value <= FIRST_THRESHOLD || fastSwipe) {
        // Snap to show delete button
        translateX.value = withSpring(FIRST_THRESHOLD, {
          damping: 50,
          stiffness: 200,
        });
      } else {
        // Snap back
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
      // If swiped, tap closes it
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
    // Fade from 1 to 0 as we go from FIRST_THRESHOLD to SECOND_THRESHOLD
    const fadeProgress = interpolate(absX, [Math.abs(FIRST_THRESHOLD), Math.abs(SECOND_THRESHOLD)], [1, 0], 'clamp');

    return {
      transform: [{ translateX: translateX.value }],
      opacity: fadeProgress,
    };
  });

  // Delete button container fills the revealed space
  const deleteContainerAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const progress = Math.min(1, absX / Math.abs(FIRST_THRESHOLD));

    return {
      opacity: progress,
      width: absX > 0 ? absX : 0,
    };
  });

  // Delete button (the pill) - icon alignment changes based on swipe distance
  const deleteButtonAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const pastSecondThreshold = absX >= Math.abs(SECOND_THRESHOLD);

    return {
      justifyContent: pastSecondThreshold ? 'flex-start' : 'center',
      paddingLeft: pastSecondThreshold ? 16 : 0,
    };
  });

  const countdown = getCountdownForTrain(train);
  // Proper pluralization: "1 HOUR" vs "2 HOURS"
  const singularUnit = countdown.unit.slice(0, -1); // Remove trailing 'S' (DAYS->DAY, HOURS->HOUR, etc.)
  const unitText = countdown.value === 1 ? singularUnit : countdown.unit;
  const unitLabel = unitText;
  const isPast = countdown.past;

  // Compute delayed times for today's trains
  const departDelay = train.daysAway <= 0 ? train.realtime?.delay : undefined;
  const arriveDelay = train.daysAway <= 0 ? train.realtime?.arrivalDelay : undefined;
  const departDelayed = departDelay && departDelay > 0
    ? addDelayToTime(train.departTime, departDelay, train.departDayOffset)
    : undefined;
  const arriveDelayed = arriveDelay && arriveDelay > 0
    ? addDelayToTime(train.arriveTime, arriveDelay, train.arriveDayOffset)
    : undefined;

  // Animated margin for first item - increases as modal collapses
  const firstItemMarginStyle = useAnimatedStyle(() => {
    if (!isFirst || !contentOpacity) {
      return {};
    }
    // When contentOpacity is 1 (half height), margin is default (Spacing.md)
    // When contentOpacity is 0 (collapsed), margin is 100
    const marginBottom = interpolate(contentOpacity.value, [0, 1], [100, Spacing.md], 'clamp');
    return {
      marginBottom,
    };
  });

  // Animated opacity for rest of the list (not the first item) - fades out as modal collapses
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
    <Animated.View style={[swipeStyles.container, firstItemMarginStyle, restItemOpacityStyle]}>
      {/* Delete button behind the card */}
      <Animated.View style={[swipeStyles.deleteButtonContainer, deleteContainerAnimatedStyle]}>
        <View style={swipeStyles.deleteButtonWrapper}>
          <GestureDetector gesture={Gesture.Tap().onEnd(() => runOnJS(handleDeletePress)())}>
            <Animated.View style={[swipeStyles.deleteButton, deleteButtonAnimatedStyle]}>
              <Ionicons name="trash" size={22} color={AppColors.primary} />
            </Animated.View>
          </GestureDetector>
        </View>
      </Animated.View>

      {/* The actual card */}
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
      {!isLast && <View style={swipeStyles.separator} />}
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

const swipeStyles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border.primary,
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
    backgroundColor: AppColors.error,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
});
