import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Chip } from "@/src/components/Chip";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { CheckIn, clearCheckIn, getCheckIn, startCheckIn } from "@/src/services/checkin";
import { requestLocation } from "@/src/utils/location";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

const OPTIONS = [15, 30, 60];

export default function CheckInScreen() {
  const router = useRouter();
  const toast = useToast();
  const [ci, setCi] = useState<CheckIn | null>(null);
  const [remaining, setRemaining] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => getCheckIn().then(setCi);
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (ci?.active && ci.deadline) {
      const tick = () => {
        const ms = new Date(ci.deadline).getTime() - Date.now();
        if (ms <= 0) { setRemaining("00:00"); return; }
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        setRemaining(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      };
      tick();
      timer.current = setInterval(tick, 1000);
      return () => { if (timer.current) clearInterval(timer.current); };
    }
  }, [ci]);

  const start = async (minutes: number) => {
    const loc = await requestLocation(); // prime permission so auto-SOS can send later
    if (!loc.coords) toast("Enable location so an auto-SOS can share your position", "info");
    await startCheckIn(minutes);
    toast(`Check-in set for ${minutes} min`, "success");
    load();
  };

  const stop = async () => {
    await clearCheckIn();
    toast("Checked in — you're safe", "success");
    load();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Safety check-in" subtitle="Auto-SOS if you don't return" onBack={() => router.back()} accent={colors.red} />
      <View style={styles.body}>
        {ci?.active ? (
          <GlassCard borderColor={colors.borderRed} style={styles.timerCard} testID="checkin-active">
            <View style={[styles.bubble, { backgroundColor: tint.red }]}>
              <Feather name="clock" size={26} color={colors.red} />
            </View>
            <Text style={styles.timer}>{remaining}</Text>
            <Text style={styles.hint}>If you don't check in, NekSathi will auto-send an SOS with your location to your guardians.</Text>
            <NeonButton label="I'm safe — check in" color={colors.green} icon="check" onPress={stop} testID="checkin-safe-button" />
          </GlassCard>
        ) : (
          <GlassCard style={styles.startCard} testID="checkin-start">
            <Text style={styles.title}>Start a timer</Text>
            <Text style={styles.hint}>Great for a night walk or commute. If the timer runs out before you check in, we alert your guardians automatically.</Text>
            <View style={styles.chips}>
              {OPTIONS.map((m) => (
                <Chip key={m} label={`${m} min`} color={colors.red} tintBg={tint.red} onPress={() => start(m)} testID={`checkin-${m}`} />
              ))}
            </View>
          </GlassCard>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  timerCard: { alignItems: "center", gap: spacing.md },
  bubble: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  timer: { color: colors.text, fontFamily: fonts.display, fontSize: 56, letterSpacing: 2 },
  startCard: { gap: spacing.md },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xl },
  hint: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18, textAlign: "center" },
  chips: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
});
