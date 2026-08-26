import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { colors, fonts, fontSize, shadow, spacing } from "@/src/theme";

interface Props {
  visible: boolean;
  seconds?: number;
  onCancel: () => void;
  onComplete: () => void;
}

// A 3-2-1 cancelable countdown shown before an SOS actually fires.
export function SosCountdown({ visible, seconds = 3, onCancel, onComplete }: Props) {
  const [count, setCount] = useState(seconds);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setCount(seconds);
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }), -1, true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    timer.current = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          if (timer.current) clearInterval(timer.current);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onComplete();
          return 0;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return c - 1;
      });
    }, 1000);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [visible]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.15 }],
    opacity: 0.5 + pulse.value * 0.5,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} testID="sos-countdown">
      <View style={styles.backdrop}>
        <Text style={styles.title}>Sending SOS in</Text>
        <Animated.View style={[styles.ring, ringStyle]}>
          <Text style={styles.count}>{count}</Text>
        </Animated.View>
        <Text style={styles.sub}>Your guardians will get your live location.</Text>
        <Pressable testID="sos-cancel-button" style={styles.cancel} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,3,8,0.92)", alignItems: "center", justifyContent: "center", gap: spacing.xl, padding: spacing.xl },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl, letterSpacing: 0.5 },
  ring: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: "rgba(255,255,255,0.2)",
    ...shadow.glowRed,
  },
  count: { color: "#fff", fontFamily: fonts.display, fontSize: 90 },
  sub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center" },
  cancel: {
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: 999,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    marginTop: spacing.md,
  },
  cancelText: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, letterSpacing: 0.5 },
});
