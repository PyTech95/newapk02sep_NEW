import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, fontSize, spacing } from "@/src/theme";

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  accent?: string;
}

// SafeArea-aware sticky header used across screens.
export function ScreenHeader({ title, subtitle, onBack, right, accent = colors.cyan }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable testID="header-back-button" onPress={onBack} hitSlop={12} style={styles.back}>
            <Feather name="chevron-left" size={26} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.leftGap} />
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: accent }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  back: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  leftGap: { width: 4 },
  titleWrap: { flex: 1 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl, letterSpacing: 0.3 },
  subtitle: { fontFamily: fonts.displayMedium, fontSize: fontSize.sm, marginTop: 2 },
  right: { minWidth: 32, alignItems: "flex-end" },
});
