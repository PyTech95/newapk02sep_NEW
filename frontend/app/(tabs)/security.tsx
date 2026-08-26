import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import {
  addCard,
  addDevice,
  addTag,
  addVehicle,
  listCards,
  listDevices,
  listTags,
  listVehicles,
  reportIntruder,
  reportSimSwap,
  setTagLost,
  setVehicleLost,
  updateTag,
} from "@/src/api/endpoints";
import { Card, Device, Tag, Vehicle } from "@/src/api/types";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { OverlayForm } from "@/src/components/OverlayForm";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";

type Seg = "theft" | "qr";
type QrKind = "vehicles" | "tags" | "cards";

export default function Security() {
  const [seg, setSeg] = useState<Seg>("theft");
  return (
    <View style={styles.root}>
      <ScreenHeader title="Security" subtitle="Anti-theft & Smart QR" accent={colors.teal} />
      <View style={styles.segment}>
        <Pressable testID="seg-theft" onPress={() => setSeg("theft")} style={[styles.segItem, seg === "theft" && { backgroundColor: colors.red }]}>
          <Feather name="lock" size={15} color={seg === "theft" ? "#03030a" : colors.textDim} />
          <Text style={[styles.segText, seg === "theft" && styles.segActiveText]}>Anti-theft</Text>
        </Pressable>
        <Pressable testID="seg-qr" onPress={() => setSeg("qr")} style={[styles.segItem, seg === "qr" && { backgroundColor: colors.teal }]}>
          <Feather name="grid" size={15} color={seg === "qr" ? "#03030a" : colors.textDim} />
          <Text style={[styles.segText, seg === "qr" && styles.segActiveText]}>Smart QR</Text>
        </Pressable>
      </View>
      {seg === "theft" ? <AntiTheft /> : <SmartQr />}
    </View>
  );
}

function AntiTheft() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    listDevices().then(setDevices).catch((e) => { setDevices([]); toast(errMessage(e), "error"); });
  }, [toast]);

  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]));

  const onAdd = async () => {
    if (!name.trim()) { toast("Enter a device name", "error"); return; }
    setBusy(true);
    try {
      await addDevice(name.trim(), "android", name.trim());
      toast("Device registered", "success");
      setShow(false); setName(""); load();
    } catch (e) {
      toast(errMessage(e, "Could not register"), "error");
    } finally { setBusy(false); }
  };

  const act = async (id: string, kind: "intruder" | "sim") => {
    try {
      if (kind === "intruder") await reportIntruder(id);
      else await reportSimSwap(id);
      toast(kind === "intruder" ? "Intruder event logged" : "SIM-swap reported", "success");
      load();
    } catch (e) {
      toast(errMessage(e, "Action failed"), "error");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <GlassCard borderColor={colors.borderRed} style={styles.infoBanner}>
        <Feather name="info" size={16} color={colors.red} />
        <Text style={styles.infoText}>Remote lock, siren & intruder-selfie run on the installed app build (Device Admin) — not in Expo Go.</Text>
      </GlassCard>

      {devices === null ? (
        <View style={styles.pad}><ActivityIndicator color={colors.red} /></View>
      ) : devices.length === 0 ? (
        <EmptyState icon="smartphone" color={colors.red} title="No devices" subtitle="Register a phone to protect it against theft." />
      ) : (
        devices.map((d) => (
          <GlassCard key={d.id} borderColor={colors.borderRed} style={styles.deviceCard} testID={`device-${d.id}`}>
            <View style={styles.deviceHead}>
              <View style={[styles.bubble, { backgroundColor: tint.red }]}>
                <Feather name="smartphone" size={20} color={colors.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{d.name}</Text>
                <Text style={styles.meta}>{d.platform}</Text>
              </View>
              <View style={styles.badges}>
                <Chip label={d.locked ? "Locked" : "Unlocked"} color={d.locked ? colors.red : colors.green} tintBg={d.locked ? tint.red : tint.green} icon={d.locked ? "lock" : "unlock"} />
                {d.siren_active && <Chip label="Siren" color={colors.amber} tintBg={tint.amber} icon="volume-2" />}
              </View>
            </View>
            <View style={styles.deviceActions}>
              <NeonButton label="Report intruder" variant="ghost" color={colors.red} icon="camera" onPress={() => act(d.id, "intruder")} style={{ flex: 1 }} testID={`device-intruder-${d.id}`} />
              <NeonButton label="SIM swap" variant="ghost" color={colors.amber} icon="alert-triangle" onPress={() => act(d.id, "sim")} style={{ flex: 1 }} testID={`device-sim-${d.id}`} />
            </View>
          </GlassCard>
        ))
      )}

      <NeonButton label="Register device" color={colors.red} icon="plus" onPress={() => setShow(true)} testID="device-add-button" />

      <OverlayForm visible={show} title="Register device" color={colors.red} submitLabel="Register" busy={busy} onClose={() => setShow(false)} onSubmit={onAdd} testID="device-form">
        <Field label="DEVICE NAME" icon="smartphone" placeholder="e.g. My Pixel" value={name} onChangeText={setName} testID="device-name-input" />
      </OverlayForm>
    </ScrollView>
  );
}

function SmartQr() {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<QrKind>("vehicles");
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");
  const [lostBusy, setLostBusy] = useState<string | null>(null);
  const [rewardFor, setRewardFor] = useState<Tag | null>(null);
  const [rewardText, setRewardText] = useState("");

  const applyLost = async (item: any, enabled: boolean, reward?: string) => {
    setLostBusy(item.id);
    try {
      if (kind === "vehicles") {
        await setVehicleLost(item.id, enabled);
      } else {
        if (enabled && reward !== undefined) {
          await updateTag(item.id, { name: item.name, tag_type: item.tag_type, reward_text: reward || null });
        }
        await setTagLost(item.id, enabled);
      }
      toast(enabled ? "Lost mode ON — scanners can now help" : "Lost mode turned off", enabled ? "success" : "info");
      load();
    } catch (e) {
      toast(errMessage(e, "Could not update lost mode"), "error");
    } finally {
      setLostBusy(null);
    }
  };

  const onToggleLost = (item: any) => {
    if (item.lost_mode) {
      applyLost(item, false);
      return;
    }
    if (kind === "tags") {
      setRewardText(item.reward_text || "");
      setRewardFor(item);
    } else {
      applyLost(item, true);
    }
  };

  const load = useCallback(() => {
    listVehicles().then(setVehicles).catch(() => setVehicles([]));
    listTags().then(setTags).catch(() => setTags([]));
    listCards().then(setCards).catch(() => setCards([]));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openQr = (qrId: string, title: string, subtitle: string, color: string) =>
    router.push({ pathname: "/qr-detail", params: { qrId, title, subtitle, color } });

  const onAdd = async () => {
    if (!f1.trim()) { toast("Please fill the required field", "error"); return; }
    setBusy(true);
    try {
      if (kind === "vehicles") await addVehicle(f1.trim().toUpperCase(), f2.trim() || "car");
      else if (kind === "tags") await addTag(f1.trim(), f2.trim() || "bag");
      else await addCard(f1.trim(), f2.trim() || undefined);
      toast("Created with a Smart QR", "success");
      setShow(false); setF1(""); setF2(""); load();
    } catch (e) {
      toast(errMessage(e, "Could not create"), "error");
    } finally { setBusy(false); }
  };

  const list = kind === "vehicles" ? vehicles : kind === "tags" ? tags : cards;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.chipRow}>
        <Chip label="Vehicles" icon="truck" color={colors.teal} tintBg={tint.teal} active={kind === "vehicles"} onPress={() => setKind("vehicles")} testID="qrkind-vehicles" />
        <Chip label="Tags" icon="tag" color={colors.teal} tintBg={tint.teal} active={kind === "tags"} onPress={() => setKind("tags")} testID="qrkind-tags" />
        <Chip label="ICE Cards" icon="credit-card" color={colors.teal} tintBg={tint.teal} active={kind === "cards"} onPress={() => setKind("cards")} testID="qrkind-cards" />
      </View>

      {list === null ? (
        <View style={styles.pad}><ActivityIndicator color={colors.teal} /></View>
      ) : list.length === 0 ? (
        <EmptyState icon="grid" color={colors.teal} title={`No ${kind}`} subtitle="Create one to generate a private, scannable Smart QR." />
      ) : (
        list.map((item: any) => {
          const title = kind === "vehicles" ? item.number_plate : kind === "tags" ? item.name : item.display_name;
          const subtitle = kind === "vehicles" ? item.vehicle_type : kind === "tags" ? item.tag_type : (item.title || "ICE card");
          const canLost = kind === "vehicles" || kind === "tags";
          const isLost = !!item.lost_mode;
          return (
            <GlassCard key={item.id} borderColor={isLost ? colors.borderRed : colors.borderTeal} style={styles.qrCard} testID={`qr-item-${item.id}`}>
              <Pressable style={styles.qrRow} onPress={() => openQr(item.qr_id, title, subtitle, isLost ? colors.red : colors.teal)} testID={`qr-open-${item.id}`}>
                <View style={[styles.qrThumb, isLost && { backgroundColor: tint.red }]}>
                  <Feather name="maximize" size={18} color={isLost ? colors.red : colors.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{title}</Text>
                  <Text style={styles.meta}>{subtitle}</Text>
                </View>
                {isLost && <Chip label="LOST" color={colors.red} tintBg={tint.red} icon="alert-circle" />}
                <Feather name="chevron-right" size={20} color={colors.textDim} />
              </Pressable>
              {isLost && item.reward_text ? (
                <Text style={styles.reward} testID={`qr-reward-${item.id}`}>🎁 {item.reward_text}</Text>
              ) : null}
              {canLost && (
                <Pressable style={styles.lostToggle} onPress={() => onToggleLost(item)} disabled={lostBusy === item.id} testID={`lost-toggle-${item.id}`}>
                  <Feather name="flag" size={15} color={isLost ? colors.red : colors.textDim} />
                  <Text style={[styles.lostText, { color: isLost ? colors.red : colors.textMuted }]}>
                    {lostBusy === item.id ? "Updating…" : isLost ? "Turn off Lost Mode" : "Mark as lost"}
                  </Text>
                </Pressable>
              )}
            </GlassCard>
          );
        })
      )}

      <NeonButton label={`Add ${kind === "cards" ? "ICE card" : kind.slice(0, -1)}`} color={colors.teal} icon="plus" onPress={() => setShow(true)} testID="qr-add-button" />

      <OverlayForm visible={show} title={`New ${kind === "cards" ? "ICE card" : kind.slice(0, -1)}`} color={colors.teal} submitLabel="Create" busy={busy} onClose={() => setShow(false)} onSubmit={onAdd} testID="qr-form">
        {kind === "vehicles" && (
          <>
            <Field label="NUMBER PLATE" icon="hash" placeholder="MH01AB1234" autoCapitalize="characters" value={f1} onChangeText={setF1} testID="qr-f1-input" />
            <Field label="TYPE" icon="truck" placeholder="car / bike" value={f2} onChangeText={setF2} testID="qr-f2-input" />
          </>
        )}
        {kind === "tags" && (
          <>
            <Field label="TAG NAME" icon="tag" placeholder="e.g. School Bag" value={f1} onChangeText={setF1} testID="qr-f1-input" />
            <Field label="TYPE" icon="box" placeholder="bag / luggage / pet" value={f2} onChangeText={setF2} testID="qr-f2-input" />
          </>
        )}
        {kind === "cards" && (
          <>
            <Field label="DISPLAY NAME" icon="user" placeholder="e.g. Ravi Kumar" value={f1} onChangeText={setF1} testID="qr-f1-input" />
            <Field label="TITLE (optional)" icon="briefcase" placeholder="e.g. Emergency contact" value={f2} onChangeText={setF2} testID="qr-f2-input" />
          </>
        )}
      </OverlayForm>

      <OverlayForm
        visible={!!rewardFor}
        title="Mark as lost"
        color={colors.red}
        submitLabel="Activate Lost Mode"
        busy={lostBusy === rewardFor?.id}
        onClose={() => setRewardFor(null)}
        onSubmit={() => { const it = rewardFor!; setRewardFor(null); applyLost(it, true, rewardText); }}
        testID="reward-form"
      >
        <Text style={styles.rewardHelp}>Anyone who scans this tag will see your reward note and can reach you privately — no personal details exposed.</Text>
        <Field label="REWARD NOTE (optional)" icon="gift" placeholder="e.g. Reward ₹500 if found" value={rewardText} onChangeText={setRewardText} testID="reward-input" />
      </OverlayForm>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, flexDirection: "row", gap: 6, paddingVertical: spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segText: { color: colors.textDim, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  segActiveText: { color: "#03030a" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  chipRow: { flexDirection: "row", gap: spacing.sm },
  pad: { paddingVertical: spacing.xxl, alignItems: "center" },
  infoBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoText: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  deviceCard: { gap: spacing.md },
  deviceHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badges: { alignItems: "flex-end", gap: 6 },
  deviceActions: { flexDirection: "row", gap: spacing.md },
  name: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  qrRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  qrCard: { gap: spacing.sm },
  qrThumb: { width: 42, height: 42, borderRadius: 10, backgroundColor: tint.teal, alignItems: "center", justifyContent: "center" },
  lostToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start", paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, width: "100%" },
  lostText: { fontFamily: fonts.displaySemi, fontSize: fontSize.sm },
  reward: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm },
  rewardHelp: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
});
