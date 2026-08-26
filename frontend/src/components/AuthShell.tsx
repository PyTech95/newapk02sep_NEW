import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassCard } from "@/src/components/GlassCard";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

const BG = "https://images.unsplash.com/photo-1626908013351-800ddd734b8a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNzl8MHwxfHNlYXJjaHwxfHxkYXJrJTIwbmVvbiUyMGN5YmVyc2VjdXJpdHklMjBhYnN0cmFjdCUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzg3NzM3MDMyfDA&ixlib=rb-4.1.0&q=85";

interface Props {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(6,6,15,0.55)", "rgba(6,6,15,0.92)", colors.bg]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={styles.brandRow}>
          <Text style={styles.brand}>
            Nek<Text style={{ color: colors.cyan }}>Sathi</Text>
          </Text>
        </View>
        <Text style={styles.tagline}>Har Musibat Mein, Ek Nek Sathi</Text>

        <GlassCard borderColor={colors.borderCyan} style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.body}>{children}</View>
        </GlassCard>
        {footer}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, flexGrow: 1, justifyContent: "center" },
  brandRow: { alignItems: "center" },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: 44, letterSpacing: 1 },
  tagline: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", marginTop: 4, marginBottom: spacing.xl },
  card: { marginTop: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl },
  subtitle: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base, marginTop: 4 },
  body: { marginTop: spacing.lg, gap: spacing.md },
});
