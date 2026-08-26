import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors, fonts, fontSize, shadow } from "@/src/theme";

interface Props {
  onPress: () => void;
  loading?: boolean;
  label?: string;
  size?: number;
}

// Large pulsing red panic button with a glowing alarm ring.
export function SOSButton({ onPress, loading, label = "SOS", size = 210 }: Props) {
  const pulse = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
    return () => cancelAnimation(pulse);
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.35 }],
    opacity: 0.5 - pulse.value * 0.5,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.65 }],
    opacity: 0.35 - pulse.value * 0.35,
  }));
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const ringSize = size;
  return (
    <View style={[styles.wrap, { width: size * 1.7, height: size * 1.7 }]}>
      <Animated.View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }, ringStyle]} />
      <Animated.View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }, ring2Style]} />
      <Pressable
        testID="sos-button"
        onPressIn={() => (press.value = withTiming(0.94, { duration: 90 }))}
        onPressOut={() => (press.value = withTiming(1, { duration: 120 }))}
        onPress={onPress}
        disabled={loading}
      >
        <Animated.View style={[styles.core, { width: size, height: size, borderRadius: size / 2 }, coreStyle]}>
          <Feather name={loading ? "loader" : "alert-octagon"} size={size * 0.28} color="#fff" />
          <Text style={styles.label}>{loading ? "SENDING…" : label}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", backgroundColor: colors.red },
  core: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.red,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.18)",
    ...shadow.glowRed,
  },
  label: { color: "#fff", fontFamily: fonts.display, fontSize: fontSize.xxl, letterSpacing: 4, marginTop: 6 },
});
