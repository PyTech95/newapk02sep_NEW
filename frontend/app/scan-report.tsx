import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { errMessage } from "@/src/api/client";
import { alertTag, messageCard, reportIncident, resolveCard, resolveQr, ResolvedItem } from "@/src/api/endpoints";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";
import { requestLocation } from "@/src/utils/location";

type Kind = "vehicle" | "tag" | "card";

const VEHICLE_TYPES = [
  { key: "wrong_parking", label: "Wrong parking", icon: "slash" as const },
  { key: "accident", label: "Accident", icon: "alert-triangle" as const },
  { key: "theft", label: "Theft", icon: "shield-off" as const },
  { key: "other", label: "Other", icon: "message-square" as const },
];
const TAG_TYPES = [
  { key: "found", label: "I found this", icon: "check-circle" as const },
  { key: "theft", label: "Looks stolen", icon: "shield-off" as const },
];

export default function ScanReport() {
  const router = useRouter();
  const toast = useToast();
  const { qrId } = useLocalSearchParams<{ qrId: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [kind, setKind] = useState<Kind>("vehicle");
  const [item, setItem] = useState<ResolvedItem | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [type, setType] = useState<string>("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    requestLocation().then((r) => {
      if (r.coords) setCoords({ lat: r.coords.latitude, lng: r.coords.longitude });
    });
  }, []);

  useEffect(() => {
    if (!qrId) return;
    (async () => {
      try {
        const v = await resolveQr(qrId);
        if (v.kind === "tag_guardian") {
          setKind("tag");
          setType("found");
        } else {
          setKind("vehicle");
          setType("wrong_parking");
        }
        setItem(v);
      } catch {
        try {
          const c = await resolveCard(qrId);
          setKind("card");
          setItem(c);
        } catch {
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [qrId]);

  const geo = { scanner_lat: coords?.lat ?? null, scanner_lng: coords?.lng ?? null };

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "vehicle") {
        await reportIncident(qrId, { type, scanner_note: note || null, scanner_phone: phone || null, ...geo });
      } else if (kind === "tag") {
        await alertTag(qrId, { type, scanner_note: note || null, scanner_phone: phone || null, ...geo });
      } else {
        await messageCard(qrId, { name, phone, message });
      }
      setDone(true);
      toast("Sent — the owner has been notified privately", "success");
    } catch (e) {
      toast(errMessage(e, "Could not send report"), "error");
    } finally {
      setBusy(false);
    }
  };

  const title = item?.number_plate || item?.name || item?.display_name || "NekSathi item";
  const accent = kind === "vehicle" ? colors.cyan : kind === "tag" ? colors.teal : colors.purple;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Help return this" subtitle="No numbers exposed" onBack={() => router.back()} accent={accent} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={accent} /></View>
      ) : notFound ? (
        <View style={styles.center}>
          <EmptyState icon="help-circle" color={colors.amber} title="QR not recognised" subtitle="This code isn't a NekSathi item, or the backend is unavailable. Try again." />
        </View>
      ) : done ? (
        <View style={styles.center}>
          <EmptyState icon="check-circle" color={colors.green} title="Thank you!" subtitle="The owner has been alerted with what you shared. You've helped keep someone safe." />
          <View style={styles.doneBtn}><NeonButton label="Done" color={colors.green} onPress={() => router.back()} testID="scan-report-done" /></View>
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <GlassCard borderColor={`${accent}66`} style={styles.itemCard}>
            <View style={[styles.bubble, { backgroundColor: `${accent}22` }]}>
              <Feather name={kind === "vehicle" ? "truck" : kind === "tag" ? "tag" : "credit-card"} size={22} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{title}</Text>
              <Text style={styles.itemSub}>
                {kind === "vehicle" ? "Vehicle" : kind === "tag" ? "Guardian tag" : "ICE card"}
                {item?.lost_mode ? " · reported lost" : ""}
              </Text>
            </View>
          </GlassCard>

          {item?.lost_mode && item?.reward_text ? (
            <GlassCard borderColor={colors.borderTeal} style={styles.reward} testID="scan-reward">
              <Feather name="gift" size={18} color={colors.teal} />
              <Text style={styles.rewardText}>{item.reward_text}</Text>
            </GlassCard>
          ) : null}

          {kind === "card" ? (
            <>
              <Text style={styles.sectionTitle}>Send a private message</Text>
              <Field label="YOUR NAME" icon="user" placeholder="Your name" value={name} onChangeText={setName} testID="scan-name-input" />
              <Field label="YOUR PHONE (optional)" icon="phone" placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="scan-phone-input" />
              <Field label="MESSAGE" icon="message-square" placeholder="e.g. I have your card, call me" value={message} onChangeText={setMessage} multiline testID="scan-message-input" />
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{kind === "vehicle" ? "What's happening?" : "How can you help?"}</Text>
              <View style={styles.chips}>
                {(kind === "vehicle" ? VEHICLE_TYPES : TAG_TYPES).map((t) => (
                  <Chip key={t.key} label={t.label} icon={t.icon} color={accent} tintBg={`${accent}22`} active={type === t.key} onPress={() => setType(t.key)} testID={`scan-type-${t.key}`} />
                ))}
              </View>
              <Field label="NOTE (optional)" icon="edit-2" placeholder="Add a helpful detail" value={note} onChangeText={setNote} testID="scan-note-input" />
              <Field label="YOUR PHONE (optional)" icon="phone" placeholder="For a private masked call back" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="scan-phone-input" />
            </>
          )}

          <Text style={styles.privacy}>🔒 Your report is routed privately — the owner never sees your number unless you share it.</Text>
          <NeonButton label="Send report" color={accent} icon="send" onPress={submit} loading={busy} testID="scan-report-submit" />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  doneBtn: { width: "100%", paddingHorizontal: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  itemCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  itemTitle: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xl },
  itemSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  reward: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rewardText: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base },
  sectionTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  privacy: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
});
