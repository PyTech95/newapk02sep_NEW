import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { errMessage } from "@/src/api/client";
import {
  alertTag,
  IncidentResult,
  messageCard,
  reportIncident,
  resolveCard,
  resolveQr,
  resolveTag,
  ResolvedItem,
} from "@/src/api/endpoints";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { requestLocation } from "@/src/utils/location";

type Kind = "vehicle" | "tag" | "card";

const VEHICLE_REASONS = [
  { key: "wrong_parking", label: "Wrong parking", icon: "slash" as const },
  { key: "accident", label: "Accident", icon: "alert-triangle" as const },
  { key: "vehicle_stolen", label: "Vehicle stolen", icon: "shield-off" as const },
  { key: "vehicle_damage", label: "Vehicle damage", icon: "alert-octagon" as const },
  { key: "window_open", label: "Window open", icon: "square" as const },
  { key: "other", label: "Something else", icon: "message-square" as const },
];
const TAG_REASONS = [
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

  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "notify" | "call">("");
  const [incident, setIncident] = useState<IncidentResult | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    requestLocation().then((r) => {
      if (r.coords) setCoords({ lat: r.coords.latitude, lng: r.coords.longitude });
    });
  }, []);

  useEffect(() => {
    if (!qrId) return;
    (async () => {
      // Detect the item type by trying vehicle → tag → card resolvers.
      try {
        const v = await resolveQr(qrId);
        setKind("vehicle");
        setReason("wrong_parking");
        setItem(v);
        return;
      } catch {
        /* not a vehicle */
      }
      try {
        const t = await resolveTag(qrId);
        setKind("tag");
        setReason("found");
        setItem(t);
        return;
      } catch {
        /* not a tag */
      }
      try {
        const c = await resolveCard(qrId);
        setKind("card");
        setItem(c);
        return;
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })().finally(() => setLoading(false));
  }, [qrId]);

  // Post the incident at most once (used by both Notify and Call).
  const ensureIncident = async (): Promise<IncidentResult> => {
    if (incident) return incident;
    const r = await reportIncident(qrId, {
      type: reason || "other",
      note: note || null,
      scanner_lat: coords?.lat ?? null,
      scanner_lng: coords?.lng ?? null,
    });
    setIncident(r);
    return r;
  };

  const onNotifyVehicle = async () => {
    setBusy("notify");
    try {
      const r = await ensureIncident();
      const mins = r.minutes_left ?? 15;
      setDone(`The owner has been alerted privately. They have about ${mins} minutes to respond.`);
    } catch (e) {
      toast(errMessage(e, "Could not notify the owner"), "error");
    } finally {
      setBusy("");
    }
  };

  const onCallVehicle = async () => {
    setBusy("call");
    try {
      const r = await ensureIncident();
      const num = (r.portal_number || "").replace(/\s+/g, "");
      if (num) {
        Linking.openURL(`tel:${num}`);
        toast("Connecting you privately to the owner…", "success");
      } else {
        toast("Private calling isn't available for this item", "error");
      }
    } catch (e) {
      toast(errMessage(e, "Could not start the call"), "error");
    } finally {
      setBusy("");
    }
  };

  const onSendTag = async () => {
    setBusy("notify");
    try {
      await alertTag(qrId, {
        type: reason || "found",
        note: note || null,
        scanner_lat: coords?.lat ?? null,
        scanner_lng: coords?.lng ?? null,
      });
      setDone("The owner has been alerted with what you shared. Thank you for your kindness!");
    } catch (e) {
      toast(errMessage(e, "Could not notify the owner"), "error");
    } finally {
      setBusy("");
    }
  };

  const onSendCard = async () => {
    setBusy("notify");
    try {
      await messageCard(qrId, { name, phone, message });
      setDone("Your message has been delivered to the owner.");
    } catch (e) {
      toast(errMessage(e, "Could not send the message"), "error");
    } finally {
      setBusy("");
    }
  };

  const accent = kind === "vehicle" ? colors.cyan : kind === "tag" ? colors.teal : colors.purple;
  const title = item?.number_plate || item?.name || item?.display_name || "NekSathi item";
  const ownerLine = item?.owner_first_name ? `Owner: ${item.owner_first_name}` : "";

  return (
    <View style={styles.root}>
      <ScreenHeader title="Help return this" subtitle="Private & secure" onBack={() => router.back()} accent={accent} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      ) : notFound ? (
        <View style={styles.center}>
          <EmptyState
            icon="help-circle"
            color={colors.amber}
            title="QR not recognised"
            subtitle="This code isn't registered as a NekSathi item. Please check and try again."
          />
        </View>
      ) : done ? (
        <View style={styles.center}>
          <EmptyState icon="check-circle" color={colors.green} title="Thank you!" subtitle={done} />
          <View style={styles.doneBtn}>
            <NeonButton label="Done" color={colors.green} onPress={() => router.back()} testID="scan-report-done" />
          </View>
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
                {kind === "vehicle"
                  ? [item?.vehicle_type, item?.make_model, item?.color].filter(Boolean).join(" · ") || "Vehicle"
                  : kind === "tag"
                    ? (item?.tag_type || "Guardian tag")
                    : (item?.title || "ICE card")}
              </Text>
              {ownerLine ? <Text style={styles.owner}>{ownerLine}</Text> : null}
            </View>
          </GlassCard>

          {item?.lost_mode ? (
            <GlassCard borderColor={colors.borderTeal} style={styles.reward} testID="scan-lost">
              <Feather name="alert-circle" size={18} color={colors.teal} />
              <Text style={styles.rewardText}>
                Reported lost{item?.reward_text ? ` · 🎁 ${item.reward_text}` : ""}
              </Text>
            </GlassCard>
          ) : null}

          {kind === "card" ? (
            <>
              {item?.phone ? (
                <NeonButton
                  label={`Call ${item.display_name || "owner"}`}
                  color={colors.green}
                  icon="phone"
                  onPress={() => Linking.openURL(`tel:${String(item.phone).replace(/\s+/g, "")}`)}
                  testID="scan-card-call"
                />
              ) : null}
              <Text style={styles.sectionTitle}>Send a private message</Text>
              <Field label="YOUR NAME" icon="user" placeholder="Your name" value={name} onChangeText={setName} testID="scan-name-input" />
              <Field label="YOUR PHONE (optional)" icon="phone" placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="scan-phone-input" />
              <Field label="MESSAGE" icon="message-square" placeholder="e.g. I have your card, please call me" value={message} onChangeText={setMessage} multiline testID="scan-message-input" />
              <NeonButton label="Send message" color={accent} icon="send" onPress={onSendCard} loading={busy === "notify"} testID="scan-card-send" />
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{kind === "vehicle" ? "What's happening?" : "How can you help?"}</Text>
              <View style={styles.chips}>
                {(kind === "vehicle" ? VEHICLE_REASONS : TAG_REASONS).map((t) => (
                  <Chip
                    key={t.key}
                    label={t.label}
                    icon={t.icon}
                    color={accent}
                    tintBg={`${accent}22`}
                    active={reason === t.key}
                    onPress={() => {
                      setReason(t.key);
                      setIncident(null);
                    }}
                    testID={`scan-reason-${t.key}`}
                  />
                ))}
              </View>

              <Field label="NOTE (optional)" icon="edit-2" placeholder="Add a helpful detail" value={note} onChangeText={setNote} testID="scan-note-input" />

              <Text style={styles.privacy}>🔒 The owner never sees your number — calls connect through a private NekSathi line.</Text>

              {kind === "vehicle" ? (
                <View style={styles.actionRow}>
                  <View style={styles.actionCol}>
                    <NeonButton label="Call owner" color={colors.green} icon="phone" onPress={onCallVehicle} loading={busy === "call"} testID="scan-vehicle-call" />
                  </View>
                  <View style={styles.actionCol}>
                    <NeonButton label="Send notification" color={accent} icon="bell" onPress={onNotifyVehicle} loading={busy === "notify"} testID="scan-vehicle-notify" />
                  </View>
                </View>
              ) : (
                <NeonButton label="Send notification" color={accent} icon="bell" onPress={onSendTag} loading={busy === "notify"} testID="scan-tag-notify" />
              )}
            </>
          )}
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
  itemSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2, textTransform: "capitalize" },
  owner: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  reward: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rewardText: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base },
  sectionTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  privacy: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  actionRow: { flexDirection: "row", gap: spacing.md },
  actionCol: { flex: 1 },
});
