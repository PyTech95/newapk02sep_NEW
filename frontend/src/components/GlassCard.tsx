import { BlurView } from "expo-blur";
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { colors, radius, shadow, spacing } from "@/src/theme";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  borderColor?: string;
  padded?: boolean;
  testID?: string;
}

// Translucent glass card. BlurView backdrop + tinted fill + subtle neon border.
export function GlassCard({ children, style, borderColor = colors.border, padded = true, testID }: Props) {
  return (
    <View style={[styles.shadow, style]} testID={testID}>
      <View style={[styles.clip, { borderColor }]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[styles.fill, padded && styles.padded]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.md, ...shadow.card },
  clip: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: colors.glass,
  },
  fill: { backgroundColor: "rgba(13,13,26,0.55)" },
  padded: { padding: spacing.lg },
});
