import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

interface Props {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  color?: string;
  testID?: string;
}

export function EmptyState({ icon, title, subtitle, color = colors.cyan, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.bubble, { backgroundColor: tint.cyan }]}>
        <Feather name={icon} size={30} color={color} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.md },
  bubble: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.xl, textAlign: "center" },
  subtitle: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", lineHeight: 20 },
});
