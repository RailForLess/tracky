import React from 'react';
import { LayoutChangeEvent, StyleProp, Text, TextStyle, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const GAP = 48;

interface MarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Optional rich content to render instead of plain text. `text` is still used for measurement. */
  children?: React.ReactNode;
}

export default function MarqueeText({ text, style, children }: MarqueeTextProps) {
  const translateX = useSharedValue(0);
  const textWidthRef = React.useRef(0);
  const containerWidthRef = React.useRef(0);
  const [overflows, setOverflows] = React.useState(false);

  const startAnimation = React.useCallback(() => {
    const tw = textWidthRef.current;
    const cw = containerWidthRef.current;
    if (tw <= cw || cw === 0) {
      cancelAnimation(translateX);
      translateX.value = 0;
      setOverflows(false);
      return;
    }
    setOverflows(true);
    const cycleWidth = tw + GAP;
    translateX.value = 0;
    translateX.value = withDelay(
      500,
      withRepeat(
        withTiming(-cycleWidth, { duration: cycleWidth * 25, easing: Easing.linear }),
        -1,
      ),
    );
  }, [translateX]);

  const onContainerLayout = React.useCallback((e: LayoutChangeEvent) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
    startAnimation();
  }, [startAnimation]);

  const onTextLayout = React.useCallback((e: LayoutChangeEvent) => {
    textWidthRef.current = e.nativeEvent.layout.width;
    startAnimation();
  }, [startAnimation]);

  React.useEffect(() => {
    startAnimation();
  }, [text, startAnimation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={{ overflow: 'hidden' }} onLayout={onContainerLayout}>
      {/* Off-screen measurement — wide parent prevents text from wrapping */}
      <View style={{ position: 'absolute', top: -9999, left: 0, width: 99999, opacity: 0, flexDirection: 'row' }}>
        <Text style={style} onLayout={onTextLayout}>{text}</Text>
      </View>
      {/* Two copies for seamless loop — when first scrolls off, second is already visible */}
      <Animated.View style={[{ flexDirection: 'row', width: 99999 }, animatedStyle]}>
        <Text style={style}>{children ?? text}</Text>
        {overflows && (
          <>
            <View style={{ width: GAP }} />
            <Text style={style}>{children ?? text}</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}
