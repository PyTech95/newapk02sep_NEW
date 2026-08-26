import { Feather } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchScanCount, getSeenCount, markScansSeen } from "@/src/services/scanBadge";
import { colors, fonts, spacing } from "@/src/theme";

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  index: "home",
  family: "users",
  safety: "shield",
  security: "lock",
  profile: "user",
};
const LABELS: Record<string, string> = {
  index: "Home",
  family: "Family",
  safety: "Safety",
  security: "Security",
  profile: "Profile",
};
const ACCENTS: Record<string, string> = {
  index: colors.cyan,
  family: colors.purple,
  safety: colors.red,
  security: colors.teal,
  profile: colors.cyan,
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [hasNew, setHasNew] = useState(false);
  const activeName = state.routes[state.index]?.name;

  useEffect(() => {
    let active = true;
    const check = async () => {
      const [count, seen] = await Promise.all([fetchScanCount(), getSeenCount()]);
      if (active) setHasNew(count > seen);
    };
    check();
    const id = setInterval(check, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (activeName === "security") {
      fetchScanCount().then((c) => { markScansSeen(c); setHasNew(false); });
    }
  }, [activeName]);

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || spacing.md }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const accent = ACCENTS[route.name] ?? colors.cyan;
          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              onPress={onPress}
              style={styles.tab}
            >
              <View style={[styles.iconWrap, focused && { backgroundColor: `${accent}22` }]}>
                <Feather name={ICONS[route.name] ?? "circle"} size={22} color={focused ? accent : colors.textDim} />
                {route.name === "security" && hasNew && !focused && <View style={styles.badge} testID="security-scan-badge" />}
              </View>
              <Text style={[styles.label, { color: focused ? accent : colors.textDim }]}>
                {LABELS[route.name] ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: "rgba(6,6,15,0.85)",
    overflow: "hidden",
  },
  row: { flexDirection: "row", paddingTop: spacing.sm },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  iconWrap: { width: 44, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 2, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.bg },
  label: { fontFamily: fonts.displayMedium, fontSize: 10, letterSpacing: 0.3 },
});
