import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import {
  dateToMinutes,
  DEFAULT_SCHEDULE,
  GuardianSchedule,
  getSchedule,
  minutesToDate,
  minutesToLabel,
  reconcileSchedule,
  saveSchedule,
} from "@/src/services/guardianSchedule";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function GuardianScheduleScreen() {
  const router = useRouter();
  const toast = useToast();
  const [sched, setSched] = useState<GuardianSchedule>(DEFAULT_SCHEDULE);
  const [show, setShow] = useState<"start" | "end" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSchedule().then(setSched);
  }, []);

  const toggleDay = (d: number) => {
    setSched((s) => ({
      ...s,
      days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort(),
    }));
  };

  const onTime = (which: "start" | "end", _e: any, date?: Date) => {
    if (Platform.OS !== "ios") setShow(null);
    if (!date) return;
    setSched((s) => ({ ...s, [which]: dateToMinutes(date) }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveSchedule(sched);
      const changed = await reconcileSchedule();
      if (changed === "started") toast("Schedule saved — Guardian is now active", "success");
      else if (changed === "stopped") toast("Schedule saved — Guardian paused (outside window)", "info");
      else toast("Schedule saved", "success");
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Guardian schedule" subtitle="Auto on/off by time" onBack={() => router.back()} accent={colors.purple} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GlassCard borderColor={colors.borderPurple} style={styles.row}>
          <View style={[styles.bubble, { backgroundColor: tint.purple }]}>
            <Feather name="clock" size={20} color={colors.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Enable schedule</Text>
            <Text style={styles.sub}>Guardian turns on and off automatically</Text>
          </View>
          <Switch
            value={sched.enabled}
            onValueChange={(v) => setSched((s) => ({ ...s, enabled: v }))}
            trackColor={{ true: colors.purple, false: colors.border }}
            thumbColor="#fff"
            testID="schedule-enable-switch"
          />
        </GlassCard>

        <Text style={styles.section}>Active window</Text>
        <View style={styles.timeRow}>
          <TimeBox label="From" value={sched.start} onPress={() => setShow("start")} testID="schedule-start" />
          <Feather name="arrow-right" size={18} color={colors.textDim} />
          <TimeBox label="To" value={sched.end} onPress={() => setShow("end")} testID="schedule-end" />
        </View>

        <Text style={styles.section}>Repeat on</Text>
        <View style={styles.daysRow}>
          {DAYS.map((d, i) => {
            const active = sched.days.includes(i);
            return (
              <Pressable key={i} onPress={() => toggleDay(i)} testID={`schedule-day-${i}`} style={[styles.day, active && { backgroundColor: colors.purple, borderColor: colors.purple }]}>
                <Text style={[styles.dayText, active && { color: "#03030a" }]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Leave all days off to run every day.</Text>

        <NeonButton label="Save schedule" color={colors.purple} icon="check" onPress={onSave} loading={saving} testID="schedule-save-button" style={{ marginTop: spacing.md }} />
        <Text style={styles.note}>Note: while the app is fully closed the OS may not flip the schedule until you next open NekSathi. Once Guardian is on, it keeps running via the foreground service. Requires an installed build.</Text>

        {show && (
          <DateTimePicker
            value={minutesToDate(show === "start" ? sched.start : sched.end)}
            mode="time"
            is24Hour={false}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(e, date) => onTime(show, e, date)}
          />
        )}
      </ScrollView>
    </View>
  );
}

function TimeBox({ label, value, onPress, testID }: { label: string; value: number; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} style={styles.timeBox} testID={testID}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={styles.timeValue}>{minutesToLabel(value)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  sub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  section: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginTop: spacing.md },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  timeBox: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  timeLabel: { color: colors.textDim, fontFamily: fonts.displayMedium, fontSize: fontSize.sm },
  timeValue: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xl, marginTop: 4 },
  daysRow: { flexDirection: "row", justifyContent: "space-between" },
  day: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  dayText: { color: colors.textMuted, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  hint: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
  note: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18, marginTop: spacing.sm },
});
