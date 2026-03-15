import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Spacing } from '../constants/theme';
import { useColors } from '../context/ThemeContext';

interface PlaceholderBlurbProps {
  icon: string;
  title: string;
  subtitle: string;
  iconSize?: number;
  iconColor?: string;
}

export function PlaceholderBlurb({
  icon,
  title,
  subtitle,
  iconSize = 36,
  iconColor,
}: PlaceholderBlurbProps) {
  const colors = useColors();
  const resolvedIconColor = iconColor ?? colors.secondary;

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={iconSize} color={resolvedIconColor} style={styles.icon} />
      <Text style={[styles.title, { color: colors.secondary }, colors.textShadow]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.tertiary }, colors.textShadow]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
    opacity: 0.5,
  },
  icon: {
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
  },
});
