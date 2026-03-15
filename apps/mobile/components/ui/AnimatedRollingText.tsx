import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const DEFAULT_DURATION = 350;
const BLUR_MAX = 4; // max blur radius in px
const EASING = Easing.bezier(0.4, 0, 0.2, 1);

/**
 * A single character slot that animates when its character changes.
 * The old character slides out (up or down) while blurring,
 * and the new character slides in from the opposite direction while deblurring.
 * Uses Animated.View wrappers with RN's `filter` for real Gaussian blur.
 */
const STAGGER_MS = 30;

const CharSlot = memo(function CharSlot({
  char,
  style,
  charHeight,
  duration,
  index,
}: {
  char: string;
  style: StyleProp<TextStyle>;
  charHeight: number;
  duration: number;
  index: number;
}) {
  const prevRef = useRef(char);
  const mountedRef = useRef(false);
  const [prev, setPrev] = useState('');

  // Outgoing (old) character
  const outY = useSharedValue(0);
  const outOpacity = useSharedValue(0);
  const outBlur = useSharedValue(0);
  // Incoming (new) character
  const inY = useSharedValue(0);
  const inOpacity = useSharedValue(1);
  const inBlur = useSharedValue(0);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (char === prevRef.current) return;

    const old = prevRef.current;
    prevRef.current = char;
    setPrev(old);

    // Direction: value increases → old scrolls up, new enters from below
    const up = char > old;
    // Slide only part-way so opacity fade is visible before clipping
    const slide = charHeight * 0.5;

    // Reset outgoing to visible + sharp
    outY.value = 0;
    outOpacity.value = 1;
    outBlur.value = 0;

    // Start incoming off-screen + blurred
    inY.value = up ? charHeight : -charHeight;
    inOpacity.value = 0;
    inBlur.value = BLUR_MAX;

    const delay = index * STAGGER_MS;
    const cfg = { duration, easing: EASING };
    const springCfg = { damping: 14, stiffness: 180, mass: 0.8 };

    // Animate outgoing: partial slide + fade + blur
    outY.value = withDelay(delay, withTiming(up ? -slide : slide, cfg));
    outOpacity.value = withDelay(delay, withTiming(0, cfg));
    outBlur.value = withDelay(delay, withTiming(BLUR_MAX, cfg));

    // Animate incoming: spring in (overshoots & bounces), fade in, deblur
    inY.value = withDelay(delay, withSpring(0, springCfg));
    inOpacity.value = withDelay(delay, withTiming(1, cfg));
    inBlur.value = withDelay(delay, withTiming(0, cfg));
  }, [char, charHeight, duration, index, outY, outOpacity, outBlur, inY, inOpacity, inBlur]);

  const outWrapperStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      transform: [{ translateY: outY.value }],
      opacity: outOpacity.value,
      filter: [{ blur: outBlur.value }],
    } as any;
  });

  const inWrapperStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: inY.value }],
      opacity: inOpacity.value,
      filter: [{ blur: inBlur.value }],
    } as any;
  });

  return (
    <View style={{ height: charHeight, overflow: 'hidden', justifyContent: 'center' }}>
      {prev !== '' && (
        <Animated.View style={outWrapperStyle}>
          <Text style={[style, { lineHeight: charHeight }]}>{prev}</Text>
        </Animated.View>
      )}
      <Animated.View style={inWrapperStyle}>
        <Text style={[style, { lineHeight: charHeight }]}>{char}</Text>
      </Animated.View>
    </View>
  );
});

interface AnimatedRollingTextProps {
  /** The text to display. Characters animate individually when value changes. */
  value: string;
  /** Text style applied to each character */
  style?: StyleProp<TextStyle>;
  /** Animation duration in ms (default: 350) */
  duration?: number;
}

/**
 * Renders text where individual characters animate with a rolling
 * departure-board effect when the value changes. Each character that
 * differs from the previous value slides out while the new one slides in,
 * with blur/deblur and opacity transitions.
 */
export default memo(function AnimatedRollingText({
  value,
  style,
  duration = DEFAULT_DURATION,
}: AnimatedRollingTextProps) {
  const flat = StyleSheet.flatten(style) || {};
  const fontSize = (flat as TextStyle).fontSize || 14;
  const charHeight = (flat as TextStyle).lineHeight || Math.ceil(fontSize * 1.35);

  // Extract layout properties for the container View; pass only text styles to chars.
  const {
    margin, marginTop, marginBottom, marginLeft, marginRight,
    marginHorizontal, marginVertical,
    alignSelf, flex, flexGrow, flexShrink, flexBasis,
    minWidth, maxWidth, width, textAlign,
    ...textStyle
  } = flat as any;
  const containerLayout: ViewStyle = {};
  if (margin !== undefined) containerLayout.margin = margin;
  if (marginTop !== undefined) containerLayout.marginTop = marginTop;
  if (marginBottom !== undefined) containerLayout.marginBottom = marginBottom;
  if (marginLeft !== undefined) containerLayout.marginLeft = marginLeft;
  if (marginRight !== undefined) containerLayout.marginRight = marginRight;
  if (marginHorizontal !== undefined) containerLayout.marginHorizontal = marginHorizontal;
  if (marginVertical !== undefined) containerLayout.marginVertical = marginVertical;
  if (alignSelf !== undefined) containerLayout.alignSelf = alignSelf;
  if (flex !== undefined) containerLayout.flex = flex;
  if (flexGrow !== undefined) containerLayout.flexGrow = flexGrow;
  if (flexShrink !== undefined) containerLayout.flexShrink = flexShrink;
  if (flexBasis !== undefined) containerLayout.flexBasis = flexBasis;
  if (minWidth !== undefined) containerLayout.minWidth = minWidth;
  if (maxWidth !== undefined) containerLayout.maxWidth = maxWidth;
  if (width !== undefined) containerLayout.width = width;
  if (textAlign === 'right') containerLayout.justifyContent = 'flex-end';
  else if (textAlign === 'center') containerLayout.justifyContent = 'center';

  // Array.from handles multi-codepoint Unicode (emojis) correctly,
  // unlike .split('') which splits on UTF-16 code units.
  const chars = Array.from(value);

  return (
    <View style={[localStyles.row, containerLayout]}>
      {chars.map((c, i) => (
        <CharSlot
          key={i}
          char={c}
          style={textStyle}
          charHeight={charHeight}
          duration={duration}
          index={i}
        />
      ))}
    </View>
  );
});

const localStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
