import React from 'react';
import { View } from 'react-native';
import { type ColorPalette, Spacing } from '../../../constants/theme';
import { SkeletonBox } from '../SkeletonBox';

interface TrainDetailSkeletonProps {
  colors: ColorPalette;
}

export default function TrainDetailSkeleton({ colors }: TrainDetailSkeletonProps) {
  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md }}>
      {/* Skeleton countdown banner */}
      <SkeletonBox width="100%" height={48} borderRadius={12} />
      {/* Skeleton departure/arrival board */}
      <View style={{ marginTop: Spacing.lg }}>
        {/* Departure */}
        <View style={{ paddingVertical: Spacing.md }}>
          <SkeletonBox width={80} height={14} borderRadius={4} />
          <SkeletonBox width={120} height={32} borderRadius={6} style={{ marginTop: 8 }} />
          <SkeletonBox width={180} height={14} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
        <View style={{ height: 1, backgroundColor: colors.border.primary, marginVertical: Spacing.sm }} />
        {/* Arrival */}
        <View style={{ paddingVertical: Spacing.md }}>
          <SkeletonBox width={80} height={14} borderRadius={4} />
          <SkeletonBox width={120} height={32} borderRadius={6} style={{ marginTop: 8 }} />
          <SkeletonBox width={180} height={14} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
      </View>
      {/* Skeleton Good to Know */}
      <View style={{ marginTop: Spacing.lg }}>
        <SkeletonBox width={100} height={14} borderRadius={4} style={{ marginBottom: Spacing.md }} />
        {[0, 1].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
            <SkeletonBox width={24} height={24} borderRadius={12} />
            <View style={{ marginLeft: Spacing.md }}>
              <SkeletonBox width={140} height={16} borderRadius={4} />
              <SkeletonBox width={100} height={12} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
