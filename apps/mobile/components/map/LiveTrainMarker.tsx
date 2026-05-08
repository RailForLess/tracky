/**
 * Live train marker component for map visualization
 * Displays train position with label (matching station marker animation style)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
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
  color?: string;
}

const markerStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 10,
  },
  clusterLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 0,
    textAlign: 'center',
  },
  trainLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 0,
    textAlign: 'center',
  },
});

function arePropsEqual(prev: LiveTrainMarkerProps, next: LiveTrainMarkerProps): boolean {
  return (
    prev.trainNumber === next.trainNumber &&
    prev.routeName === next.routeName &&
    prev.coordinate.latitude === next.coordinate.latitude &&
    prev.coordinate.longitude === next.coordinate.longitude &&
    prev.isSaved === next.isSaved &&
    prev.isCluster === next.isCluster &&
    prev.clusterCount === next.clusterCount &&
    prev.onPress === next.onPress &&
    prev.color === next.color
  );
}

export const LiveTrainMarker = React.memo(function LiveTrainMarker({
  trainNumber,
  routeName,
  coordinate,
  isSaved = false,
  isCluster = false,
  clusterCount = 0,
  onPress,
  color = '#FFFFFF',
}: LiveTrainMarkerProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const [currentLabel, setCurrentLabel] = useState(isCluster ? `${clusterCount}+` : trainNumber);
  const [currentIsCluster, setCurrentIsCluster] = useState(isCluster);

  const iconColor = color;

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
  }, []);

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
  }, [newLabel, isCluster, currentLabel, currentIsCluster]);

  return (
    <Marker lngLat={[coordinate.longitude, coordinate.latitude]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View
        style={[
          markerStyles.container,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TrainIcon
          name={routeName ?? undefined}
          size={24}
          color={iconColor}
        />
        <Text
          style={[
            currentIsCluster ? markerStyles.clusterLabel : markerStyles.trainLabel,
            { color: iconColor },
          ]}
          numberOfLines={1}
        >
          {currentLabel}
        </Text>
      </Animated.View>
      </TouchableOpacity>
    </Marker>
  );
}, arePropsEqual);
