import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { getIncidentDetail, IncidentDetail, respondIncident } from "@/src/api/endpoints";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { ScanMap } from "@/src/components/ScanMap";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";

export default function IncidentDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"coming" | "cant" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const inc = await getIncidentDetail(String(id));
      setIncident(inc);
      if (inc?.minutes_left != null && !inc.resolved) {
        deadlineRef.current = Date.now() + inc.minutes_left * 60 * 1000;
      } else {
        deadlineRef.current = null;
      }
    } catch (e) {
      toast(errMessage(e, "Could not load this alert"), "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Local live countdown of the finder's waiting window.
  useEffect(() => {
    const tick = () => {
      if (deadlineRef.current == null) {
        setSecondsLeft(null);
        return;
      }
      setSecondsLeft(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [incident]);

  const reply = async (response: "coming" | "cant") => {
    if (!incident) return;
    setBusy(response);
    try {
      await respondIncident(incident.id, response);
      setIncident({ ...incident, owner_response: response });
      toast(
        response === "coming" ? "The finder has been told you're on the way" : "The finder has been told you can't come",
        "success",
      );
    } catch (e) {
      toast(errMessage(e, "Could not send your response"), "error");
    } finally {
      setBusy(null);
    }
  };

  const lat = incident?.scanner_lat ?? null;
  const lng = incident?.scanner_lng ?? null;
  const hasLoc = lat != null && !Number.isNaN(lat) && lng != null && !Number.isNaN(lng);
  const photo = incident?.evidence_photo_base64 || incident?.reporter_photo_base64 || null;
  const typeLabel = String(incident?.type || "alert").replace(/_/g, " ");
  const when = incident?.created_at ? new Date(incident.created_at).toLocaleString() : "";
  const responded = incident?.owner_response ?? null;

  const openMaps = () => {
    if (!hasLoc) return;
    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${lat},${lng}&q=Finder`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url!);
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Incident"
        subtitle={incident?.number_plate || typeLabel}
        accent={colors.amber}
        onBack={() => router.back()}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : !incident ? (
        <View style={styles.center}>
          <Feather name="inbox" size={28} color={colors.textDim} />
          <Text style={styles.muted}>This alert is no longer available.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GlassCard style={styles.card}>
            <View style={styles.headRow}>
              <View style={[styles.badge, { backgroundColor: tint.amber }]}>
                <Text style={[styles.badgeText, { color: colors.amber }]}>{typeLabel}</Text>
              </View>
              {when ? <Text style={styles.time}>{when}</Text> : null}
            </View>
            {incident.scanner_note ? (
              <Text style={styles.note}>&ldquo;{incident.scanner_note}&rdquo;</Text>
            ) : (
              <Text style={styles.muted}>No note left by the finder.</Text>
            )}
          </GlassCard>

          {/* Countdown / status */}
          {responded ? (
            <GlassCard borderColor={responded === "coming" ? colors.borderGreen : colors.borderRed} style={styles.statusCard}>
              <Feather
                name={responded === "coming" ? "check-circle" : "x-circle"}
                size={20}
                color={responded === "coming" ? colors.green : colors.red}
              />
              <Text style={styles.statusText}>
                {responded === "coming"
                  ? "You told the finder you're coming."
                  : "You told the finder you can't come."}
              </Text>
            </GlassCard>
          ) : secondsLeft != null && secondsLeft > 0 ? (
            <GlassCard borderColor={colors.borderAmber} style={styles.statusCard}>
              <Feather name="clock" size={20} color={colors.amber} />
              <Text style={styles.statusText}>
                The finder is waiting — <Text style={{ color: colors.amber }}>{mmss(secondsLeft)}</Text> left to respond.
              </Text>
            </GlassCard>
          ) : (
            <GlassCard style={styles.statusCard}>
              <Feather name="clock" size={20} color={colors.textDim} />
              <Text style={styles.statusText}>The response window has closed.</Text>
            </GlassCard>
          )}

          {photo ? (
            <GlassCard style={styles.card} padded={false}>
              <Image
                source={{ uri: photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}` }}
                style={styles.photo}
                resizeMode="cover"
              />
            </GlassCard>
          ) : null}

          {hasLoc ? (
            <GlassCard style={styles.mapCard} padded={false}>
              <View style={styles.mapWrap}>
                <ScanMap points={[{ id: "finder", lat: lat!, lng: lng!, label: "Finder location", when, danger: true }]} />
              </View>
              <View style={styles.mapFoot}>
                <Feather name="map-pin" size={16} color={colors.teal} />
                <Text style={styles.coords}>
                  {lat!.toFixed(5)}, {lng!.toFixed(5)}
                </Text>
                <Text style={styles.openLink} onPress={openMaps}>
                  Open in Maps
                </Text>
              </View>
            </GlassCard>
          ) : null}

          {/* Reply buttons */}
          <Text style={styles.sectionTitle}>Reply to the finder</Text>
          <NeonButton
            label={responded === "coming" ? "You're coming ✓" : "I'm coming"}
            color={colors.green}
            icon="navigation"
            loading={busy === "coming"}
            onPress={() => reply("coming")}
            testID="incident-reply-coming"
          />
          <NeonButton
            label={responded === "cant" ? "Marked can't come ✓" : "I can't come right now"}
            variant="ghost"
            color={colors.red}
            icon="x-circle"
            loading={busy === "cant"}
            onPress={() => reply("cant")}
            testID="incident-reply-cant"
          />

          {incident.scanner_phone ? (
            <NeonButton
              label={`Call finder (${incident.scanner_phone})`}
              variant="ghost"
              color={colors.cyan}
              icon="phone"
              onPress={() => Linking.openURL(`tel:${String(incident.scanner_phone).replace(/\s+/g, "")}`)}
              testID="incident-call-finder"
            />
          ) : (
            <Text style={styles.muted}>The finder didn&apos;t share a phone number.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { gap: spacing.sm },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.displaySemi, fontSize: fontSize.sm, textTransform: "capitalize" },
  time: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
  note: { color: colors.text, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 22 },
  muted: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statusText: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 20 },
  photo: { width: "100%", height: 220, borderRadius: radius.lg },
  mapCard: { overflow: "hidden" },
  mapWrap: { height: 240, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  mapFoot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  coords: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm },
  openLink: { color: colors.teal, fontFamily: fonts.displaySemi, fontSize: fontSize.sm },
  sectionTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginTop: spacing.sm },
});
