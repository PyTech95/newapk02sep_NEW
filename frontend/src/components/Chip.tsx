import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

interface Props {
  label: string;
  color?: string;
  tintBg?: string;
  active?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  testID?: string;
}

export function Chip({ label, color = colors.cyan, tintBg, active = true, icon, onPress, testID }: Props) {
  const border = active ? color : colors.border;
  const bg = active ? tintBg ?? "rgba(34,211,238,0.14)" : "transparent";
  const fg = active ? color : colors.textDim;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { borderColor: border, backgroundColor: bg }]}
    >
      {icon && <Feather name={icon} size={13} color={fg} />}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: { fontFamily: fonts.displayMedium, fontSize: fontSize.sm, letterSpacing: 0.3 },
});
