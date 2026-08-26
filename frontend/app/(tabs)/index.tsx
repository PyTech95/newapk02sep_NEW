import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { errMessage } from "@/src/api/client";
import { ackSos, listContacts, listSafeZones, listSosEvents, startLiveShare, triggerSos } from "@/src/api/endpoints";
import { SosEvent } from "@/src/api/types";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SOSButton } from "@/src/components/SOSButton";
import { SosCountdown } from "@/src/components/SosCountdown";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { reconcileCheckIn } from "@/src/services/checkin";
import { fetchScanCount, getSeenCount } from "@/src/services/scanBadge";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";
import { requestLocation } from "@/src/utils/location";

export default function Home() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [sosLoading, setSosLoading] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  const startSos = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setCountdown(true);
  };
  const [blocked, setBlocked] = useState(false);
  const [stats, setStats] = useState({ sos: 0, contacts: 0, zones: 0 });
  const [hasNew, setHasNew] = useState(false);
  const [activeSos, setActiveSos] = useState<SosEvent | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const [c, seen] = await Promise.all([fetchScanCount(), getSeenCount()]);
      if (active) setHasNew(c > seen);
    };
    check();
    const id = setInterval(check, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const loadStats = useCallback(() => {
    Promise.all([listSosEvents(), listContacts(), listSafeZones()])
      .then(([sos, contacts, zones]) => {
        setStats({ sos: sos.length, contacts: contacts.length, zones: zones.length });
        setActiveSos(sos.find((s) => !s.acknowledged) ?? null);
      })
      .catch(() => {});
  }, []);

  const onCancelSos = async () => {
    if (!activeSos) return;
    try {
      await ackSos(activeSos.id);
      setActiveSos(null);
      toast("Marked safe — escalation stopped", "success");
      loadStats();
    } catch {
      toast("Could not update", "error");
    }
  };

  useFocusEffect(useCallback(() => { loadStats(); reconcileCheckIn().then((fired) => { if (fired) { toast("Check-in missed — SOS sent automatically", "error"); loadStats(); } }); }, [loadStats]));

  const onSos = async () => {
    setSosLoading(true);
    const loc = await requestLocation();
    if (!loc.coords) {
      setBlocked(!!loc.blocked);
      toast(loc.error ?? "Location unavailable", "error");
      setSosLoading(false);
      return;
    }
    setBlocked(false);
    try {
      const ev = await triggerSos(loc.coords.latitude, loc.coords.longitude);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast(`SOS sent — ${ev.notified} guardian(s) alerted`, "success");
      loadStats();
    } catch (e) {
      toast(errMessage(e, "Could not send SOS"), "error");
    } finally {
      setSosLoading(false);
    }
  };

  const onLiveShare = async () => {
    setShareLoading(true);
    const loc = await requestLocation();
    if (!loc.coords) {
      setBlocked(!!loc.blocked);
      toast(loc.error ?? "Location unavailable", "error");
      setShareLoading(false);
      return;
    }
    try {
      await startLiveShare(60);
      toast("Live location shared for 60 min", "success");
    } catch (e) {
      toast(errMessage(e, "Could not start live share"), "error");
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={`Hi, ${user?.name?.split(" ")[0] ?? "there"}`}
        subtitle="You're protected"
        right={
          <View style={{ flexDirection: "row", gap: 18 }}>
            <Pressable testID="home-scan-button" onPress={() => router.push("/scan")} hitSlop={10}>
              <Feather name="maximize" size={22} color={colors.teal} />
            </Pressable>
            <Pressable testID="home-alerts-button" onPress={() => router.push("/alerts")} hitSlop={10}>
              <Feather name="bell" size={22} color={colors.text} />
              {hasNew && <View style={styles.bellDot} testID="home-scan-badge" />}
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeSos && (
          <View style={styles.sosBanner} testID="active-sos-banner">
            <Feather name="alert-octagon" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.sosBannerTitle}>SOS active</Text>
              <Text style={styles.sosBannerSub}>Guardians alerted · escalating until acknowledged</Text>
            </View>
            <Pressable testID="active-sos-cancel" onPress={onCancelSos} style={styles.sosBannerBtn}>
              <Text style={styles.sosBannerBtnText}>I'm safe</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.prompt}>Tap and hold nothing — one tap on SOS instantly alerts your guardians with your live location.</Text>

        <View style={styles.sosWrap}>
          <SOSButton onPress={startSos} loading={sosLoading} />
        </View>

        {blocked && (
          <GlassCard borderColor={colors.borderRed} style={styles.banner}>
            <Text style={styles.bannerText}>Location is blocked. Enable it in Settings to use SOS.</Text>
            <Pressable testID="open-settings-button" onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
              <Feather name="settings" size={16} color={colors.red} />
              <Text style={styles.settingsText}>Open Settings</Text>
            </Pressable>
          </GlassCard>
        )}

        <Animated.View entering={FadeInDown.delay(80)}>
          <Pressable testID="home-live-share" onPress={onLiveShare}>
            <GlassCard borderColor={colors.borderCyan} style={styles.shareCard}>
              <View style={[styles.iconBubble, { backgroundColor: tint.cyan }]}>
                <Feather name="radio" size={20} color={colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>{shareLoading ? "Starting…" : "Share live location"}</Text>
                <Text style={styles.shareSub}>Let your family follow you for 60 minutes</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textDim} />
            </GlassCard>
          </Pressable>
        </Animated.View>

        <View style={styles.statsRow}>
          <StatCard icon="alert-octagon" color={colors.red} value={stats.sos} label="SOS sent" onPress={() => router.push("/sos-events")} testID="stat-sos" />
          <StatCard icon="phone" color={colors.cyan} value={stats.contacts} label="Contacts" onPress={() => router.push("/contacts")} testID="stat-contacts" />
          <StatCard icon="map-pin" color={colors.teal} value={stats.zones} label="Safe zones" onPress={() => router.push("/safe-zones")} testID="stat-zones" />
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>
        <ActionRow icon="users" color={colors.purple} title="Emergency contacts" sub="Who gets alerted first" onPress={() => router.push("/contacts")} testID="action-contacts" />
        <ActionRow icon="shield" color={colors.teal} title="Safe zones" sub="Get notified on arrive & leave" onPress={() => router.push("/safe-zones")} testID="action-zones" />
        <ActionRow icon="clock" color={colors.cyan} title="SOS history" sub="Review past alerts" onPress={() => router.push("/sos-events")} testID="action-history" />
      </ScrollView>
      <SosCountdown
        visible={countdown}
        onCancel={() => { setCountdown(false); toast("SOS cancelled", "info"); }}
        onComplete={() => { setCountdown(false); onSos(); }}
      />
    </View>
  );
}

function StatCard({ icon, color, value, label, onPress, testID }: { icon: keyof typeof Feather.glyphMap; color: string; value: number; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} testID={testID}>
      <GlassCard padded={false} style={styles.stat}>
        <View style={styles.statInner}>
          <Feather name={icon} size={18} color={color} />
          <Text style={styles.statValue}>{value}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      </GlassCard>
    </Pressable>
  );
}

function ActionRow({ icon, color, title, sub, onPress, testID }: { icon: keyof typeof Feather.glyphMap; color: string; title: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} testID={testID}>
      <GlassCard style={styles.action}>
        <View style={[styles.iconBubble, { backgroundColor: `${color}22` }]}>
          <Feather name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionSub}>{sub}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textDim} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bellDot: { position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.bg },
  sosBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.red, borderRadius: radius.md, padding: spacing.md },
  sosBannerTitle: { color: "#fff", fontFamily: fonts.display, fontSize: fontSize.lg, letterSpacing: 0.5 },
  sosBannerSub: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontSize: fontSize.sm },
  sosBannerBtn: { backgroundColor: "#fff", borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  sosBannerBtnText: { color: colors.red, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  prompt: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 20, textAlign: "center" },
  sosWrap: { alignItems: "center", marginVertical: spacing.sm },
  banner: { gap: spacing.sm },
  bannerText: { color: colors.text, fontFamily: fonts.body, fontSize: fontSize.base },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  settingsText: { color: colors.red, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  shareCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  shareTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  shareSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  iconBubble: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  stat: { flex: 1 },
  statInner: { padding: spacing.md, alignItems: "flex-start", gap: 4 },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl },
  statLabel: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
  sectionTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginTop: spacing.md, marginBottom: spacing.xs },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  actionSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
});
