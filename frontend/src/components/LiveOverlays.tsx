import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IncomingCall, listAlerts, listIncomingCalls, rejectCall } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

const CALL_POLL_MS = 5000;
const ALERT_POLL_MS = 15000;

// App-wide overlays for logged-in users:
//  • Incoming masked-call ring (someone scanned your QR and tapped "call")
//  • New scan-alert / incident notifications (toast + buzz)
export function LiveOverlays() {
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const handledCalls = useRef<Set<string>>(new Set());
  const knownAlerts = useRef<Set<string>>(new Set());
  const alertsPrimed = useRef(false);
  const pulse = useRef(new Animated.Value(0)).current;

  // Poll for incoming masked calls.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const items = await listIncomingCalls();
        if (cancelled) return;
        const next = items.find((c) => !handledCalls.current.has(c.call_id));
        setCall((cur) => (cur ? cur : next ?? null));
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, CALL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);

  // Poll for new alerts / incidents.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const items = await listAlerts();
        if (cancelled || !Array.isArray(items)) return;
        if (!alertsPrimed.current) {
          items.forEach((a) => a?.id && knownAlerts.current.add(a.id));
          alertsPrimed.current = true;
          return;
        }
        const fresh = items.filter((a) => a?.id && !knownAlerts.current.has(a.id));
        fresh.forEach((a) => knownAlerts.current.add(a.id));
        if (fresh.length) {
          const a: any = fresh[0];
          const label = a.number_plate || a.name || "your item";
          const kind = String(a.type || "alert").replace(/_/g, " ");
          if (Platform.OS !== "web") Vibration.vibrate(400);
          toast(`🔔 New ${kind} on ${label}`, "error");
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, ALERT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);

  // Ring (buzz + pulse) while a call is showing.
  useEffect(() => {
    if (!call) return;
    if (Platform.OS !== "web") Vibration.vibrate([0, 700, 600, 700, 600], true);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      Vibration.cancel();
      loop.stop();
    };
  }, [call]);

  const dismiss = (c: IncomingCall) => {
    handledCalls.current.add(c.call_id);
    Vibration.cancel();
    setCall(null);
  };

  const onDecline = async (c: IncomingCall) => {
    try {
      await rejectCall(c.call_id);
    } catch {
      /* ignore */
    }
    dismiss(c);
  };

  const onAccept = (c: IncomingCall) => {
    dismiss(c);
    toast("Answering with live voice opens in the installed app build", "success");
  };

  if (!call) return null;

  // Responsive sizing based on the current viewport.
  const avatar = Math.min(Math.max(width * 0.30, 96), 148);
  const ring = avatar * 1.55;
  const iconSize = avatar * 0.4;
  const btn = Math.min(Math.max(width * 0.36, 128), 168);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.55] });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => onDecline(call)}>
      <View
        style={[styles.backdrop, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}
        testID="incoming-call-overlay"
      >
        <View style={styles.top}>
          <Text style={styles.tag}>NekSathi · incoming call</Text>
        </View>

        <View style={styles.middle}>
          <View style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl }}>
            <Animated.View
              style={[styles.ringGlow, { width: ring, height: ring, borderRadius: ring / 2, opacity: glow, transform: [{ scale }] }]}
            />
            <View style={[styles.avatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]}>
              <Feather name="phone-incoming" size={iconSize} color={colors.bg} />
            </View>
          </View>
          <Text style={[styles.title, { fontSize: Math.min(width * 0.07, 28) }]} numberOfLines={2} adjustsFontSizeToFit>
            Someone needs to reach you
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            about {call.number_plate ? `vehicle ${call.number_plate}` : "your tagged item"}
          </Text>
        </View>

        <View style={[styles.actions, height < 640 && { gap: spacing.lg }]}>
          <Pressable style={styles.action} onPress={() => onDecline(call)} testID="call-decline">
            <View style={[styles.circle, styles.decline, { width: btn * 0.42, height: btn * 0.42, borderRadius: btn * 0.21 }]}>
              <Feather name="phone-off" size={btn * 0.2} color="#fff" />
            </View>
            <Text style={styles.btnText}>Decline</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => onAccept(call)} testID="call-accept">
            <View style={[styles.circle, styles.accept, { width: btn * 0.42, height: btn * 0.42, borderRadius: btn * 0.21 }]}>
              <Feather name="phone-call" size={btn * 0.2} color="#04120c" />
            </View>
            <Text style={styles.btnText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(4,4,12,0.97)", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl },
  top: { alignItems: "center" },
  tag: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, letterSpacing: 1, textTransform: "uppercase" },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", width: "100%" },
  ringGlow: { position: "absolute", backgroundColor: colors.green },
  avatar: { backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontFamily: fonts.display, textAlign: "center" },
  sub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", marginTop: spacing.xs },
  actions: { flexDirection: "row", justifyContent: "center", gap: spacing.xxxl, width: "100%" },
  action: { alignItems: "center", gap: spacing.sm },
  circle: { alignItems: "center", justifyContent: "center" },
  decline: { backgroundColor: colors.red },
  accept: { backgroundColor: colors.green },
  btnText: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
});
