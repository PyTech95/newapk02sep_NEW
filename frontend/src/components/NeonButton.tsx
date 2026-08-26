import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  color?: string;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function NeonButton({
  label,
  onPress,
  variant = "primary",
  color = colors.cyan,
  icon,
  loading,
  disabled,
  style,
  testID,
}: Props) {
  const isGhost = variant === "ghost";
  const accent = variant === "danger" ? colors.red : color;
  const bg = isGhost ? "transparent" : accent;
  const fg = isGhost ? accent : "#03030a";

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: accent, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={18} color={fg} />}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    minHeight: 50,
  },
  label: { fontFamily: fonts.displaySemi, fontSize: fontSize.lg, letterSpacing: 0.3 },
});
