import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, AppState } from "react-native";

import { errMessage } from "@/src/api/client";
import { listContacts, listSafeZones, listSosEvents, startLiveShare } from "@/src/api/endpoints";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { isGuardianRunning, startGuardian, stopGuardian } from "@/src/services/backgroundLocation";
import { getSchedule, minutesToLabel, reconcileSchedule, type GuardianSchedule } from "@/src/services/guardianSchedule";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";
import { requestLocation } from "@/src/utils/location";

export default function Safety() {
  const router = useRouter();
  const toast = useToast();
  const [counts, setCounts] = useState({ contacts: 0, zones: 0, sos: 0 });
  const [sharing, setSharing] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [guardianBusy, setGuardianBusy] = useState(false);
  const [sched, setSched] = useState<GuardianSchedule | null>(null);

  const syncGuardian = useCallback(async () => {
    await reconcileSchedule();
    setGuardian(await isGuardianRunning());
    setSched(await getSchedule());
  }, []);

  useEffect(() => {
    syncGuardian();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") syncGuardian(); });
    return () => sub.remove();
  }, [syncGuardian]);

  const onGuardian = async (value: boolean) => {
    setGuardianBusy(true);
    try {
      if (value) {
        const res = await startGuardian();
        if (res.ok) {
          setGuardian(true);
          toast("Guardian on — family sees your live trail", "success");
        } else {
          setGuardian(false);
          toast(res.error ?? "Could not start Guardian", "error");
          if (res.blocked && Platform.OS !== "web") Linking.openSettings();
        }
      } else {
        await stopGuardian();
        setGuardian(false);
        toast("Guardian turned off", "info");
      }
    } finally {
      setGuardianBusy(false);
    }
  };

  const load = useCallback(() => {
    Promise.all([listContacts(), listSafeZones(), listSosEvents()])
      .then(([c, z, s]) => setCounts({ contacts: c.length, zones: z.length, sos: s.length }))
      .catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); syncGuardian(); }, [load, syncGuardian]));

  const onLiveShare = async () => {
    setSharing(true);
    const loc = await requestLocation();
    if (!loc.coords) {
      toast(loc.error ?? "Location unavailable", "error");
      setSharing(false);
      return;
    }
    try {
      await startLiveShare(60);
      toast("Live location shared for 60 min", "success");
    } catch (e) {
      toast(errMessage(e, "Could not start live share"), "error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Safety" subtitle="Your personal safety tools" accent={colors.red} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onLiveShare} testID="safety-live-share">
          <GlassCard borderColor={colors.borderCyan} style={styles.hero}>
            <View style={[styles.bubble, { backgroundColor: "rgba(34,211,238,0.14)" }]}>
              <Feather name="radio" size={22} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{sharing ? "Starting live share…" : "Share live location"}</Text>
              <Text style={styles.heroSub}>Family can follow you in real time for 60 minutes</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textDim} />
          </GlassCard>
        </Pressable>

        <GlassCard borderColor={colors.borderPurple} style={styles.guardian} testID="guardian-card">
          <View style={[styles.bubble, { backgroundColor: tint.purple }]}>
            <Feather name="shield" size={22} color={colors.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Background Guardian</Text>
            <Text style={styles.heroSub}>Pings your location every 60s so family sees your live trail — even when the app is closed</Text>
          </View>
          <Switch
            value={guardian}
            disabled={guardianBusy}
            onValueChange={onGuardian}
            trackColor={{ true: colors.purple, false: colors.border }}
            thumbColor="#fff"
            testID="guardian-switch"
          />
        </GlassCard>

        <Pressable onPress={() => router.push("/guardian-schedule")} testID="safety-schedule">
          <GlassCard style={styles.tool}>
            <View style={[styles.bubble, { backgroundColor: tint.purple }]}>
              <Feather name="clock" size={20} color={colors.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolTitle}>Guardian schedule</Text>
              <Text style={styles.toolSub}>
                {sched?.enabled ? `Auto ${minutesToLabel(sched.start)} – ${minutesToLabel(sched.end)}` : "Auto-enable during set hours"}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textDim} />
          </GlassCard>
        </Pressable>

        <Tool icon="users" color={colors.purple} title="Emergency contacts" sub={`${counts.contacts} trusted contact(s)`} onPress={() => router.push("/contacts")} testID="safety-contacts" />
        <Tool icon="map-pin" color={colors.teal} title="Safe zones" sub={`${counts.zones} zone(s) monitored`} onPress={() => router.push("/safe-zones")} testID="safety-zones" />
        <Tool icon="clock" color={colors.cyan} title="SOS history" sub={`${counts.sos} past alert(s)`} onPress={() => router.push("/sos-events")} testID="safety-history" />
        <Tool icon="bell" color={colors.amber} title="Alerts & incidents" sub="Notifications and reports" onPress={() => router.push("/alerts")} testID="safety-alerts" />
        <Tool icon="maximize" color={colors.teal} title="Scan a found item" sub="Help return someone's lost bag or vehicle" onPress={() => router.push("/scan")} testID="safety-scan" />
      </ScrollView>
    </View>
  );
}

function Tool({ icon, color, title, sub, onPress, testID }: { icon: keyof typeof Feather.glyphMap; color: string; title: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} testID={testID}>
      <GlassCard style={styles.tool}>
        <View style={[styles.bubble, { backgroundColor: `${color}22` }]}>
          <Feather name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.toolTitle}>{title}</Text>
          <Text style={styles.toolSub}>{sub}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textDim} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  guardian: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  heroSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  bubble: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tool: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toolTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  toolSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
});
