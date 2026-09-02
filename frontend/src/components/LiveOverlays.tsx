import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, Vibration, View } from "react-native";

import { IncomingCall, listAlerts, listIncomingCalls, rejectCall } from "@/src/api/endpoints";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

const CALL_POLL_MS = 5000;
const ALERT_POLL_MS = 15000;

// App-wide overlays for logged-in users:
//  • Incoming masked-call ring (someone scanned your QR and tapped "call")
//  • New scan-alert / incident notifications (toast + buzz)
export function LiveOverlays() {
  const { user } = useAuth();
  const toast = useToast();
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

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onDecline(call)}>
      <View style={styles.backdrop} testID="incoming-call-overlay">
        <Text style={styles.tag}>NekSathi · incoming call</Text>
        <Animated.View style={[styles.ringGlow, { opacity: glow, transform: [{ scale }] }]} />
        <View style={styles.avatar}>
          <Feather name="phone-incoming" size={40} color={colors.bg} />
        </View>
        <Text style={styles.title}>Someone needs to reach you</Text>
        <Text style={styles.sub}>
          about {call.number_plate ? `vehicle ${call.number_plate}` : "your tagged item"}
        </Text>
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.decline]} onPress={() => onDecline(call)} testID="call-decline">
            <Feather name="phone-off" size={24} color="#fff" />
            <Text style={styles.btnText}>Decline</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.accept]} onPress={() => onAccept(call)} testID="call-accept">
            <Feather name="phone-call" size={24} color="#04120c" />
            <Text style={[styles.btnText, { color: "#04120c" }]}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(4,4,12,0.97)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  tag: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.xxl },
  ringGlow: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: colors.green, top: "34%" },
  avatar: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl, textAlign: "center" },
  sub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.xxl, marginTop: spacing.xxxl },
  btn: { alignItems: "center", justifyContent: "center", gap: 6, width: 120, paddingVertical: spacing.md, borderRadius: radius.lg },
  decline: { backgroundColor: colors.red },
  accept: { backgroundColor: colors.green },
  btnText: { color: "#fff", fontFamily: fonts.displaySemi, fontSize: fontSize.base },
});
