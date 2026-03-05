/**
 * Live train marker component for map visualization
 * Displays train position with label (matching station marker animation style)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { TrainIcon } from '../TrainIcon';

interface LiveTrainMarkerProps {
  trainNumber: string;
  routeName: string | null;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  isSaved?: boolean;
  isCluster?: boolean;
  clusterCount?: number;
  onPress?: () => void;
}

export function LiveTrainMarker({
  trainNumber,
  routeName,
  coordinate,
  isSaved = false,
  isCluster = false,
  clusterCount = 0,
  onPress,
}: LiveTrainMarkerProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const [currentLabel, setCurrentLabel] = useState(isCluster ? `${clusterCount}+` : trainNumber);
  const [currentIsCluster, setCurrentIsCluster] = useState(isCluster);

  const iconColor = '#FFFFFF';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const newLabel = isCluster ? `${clusterCount}+` : trainNumber;
  useEffect(() => {
    if (newLabel !== currentLabel || isCluster !== currentIsCluster) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0.3,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.9,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(10),
      ]).start(() => {
        setCurrentLabel(newLabel);
        setCurrentIsCluster(isCluster);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  }, [newLabel, isCluster, currentLabel, currentIsCluster, fadeAnim, scaleAnim]);

  return (
    <Marker coordinate={coordinate} onPress={onPress} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          padding: 10,
        }}
      >
        <TrainIcon
          name={routeName}
          size={24}
          color={iconColor}
          style={{
            textShadowColor: 'rgba(0, 0, 0, 0.8)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
        />
        <Text
          style={{
            color: iconColor,
            fontSize: currentIsCluster ? 10 : 9,
            fontWeight: '600',
            marginTop: 0,
            textAlign: 'center',
            textShadowColor: 'rgba(0, 0, 0, 0.8)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
          numberOfLines={1}
        >
          {currentLabel}
        </Text>
      </Animated.View>
    </Marker>
  );
}
