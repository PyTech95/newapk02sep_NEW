import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errMessage } from "@/src/api/client";
import { createFamily, getFamily, joinFamily, listSafeZones } from "@/src/api/endpoints";
import { FamilyMember, FamilyResponse, SafeZone } from "@/src/api/types";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { FamilyMap } from "@/src/components/FamilyMap";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";

function sinceLabel(iso: string | null): string {
  if (!iso) return "no data";
  const diff = Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Family() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<FamilyResponse | null>(null);
  const [zones, setZones] = useState<SafeZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["22%", "70%"], []);

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true);
    try {
      const [fam, zn] = await Promise.all([getFamily(), listSafeZones()]);
      setData(fam);
      setZones(zn);
    } catch (e) {
      toast(errMessage(e, "Could not load family"), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load(true);
      const id = setInterval(() => load(false), 30000);
      return () => clearInterval(id);
    }, [load]),
  );

  const submit = async () => {
    if (!text.trim()) {
      toast(mode === "create" ? "Enter a family name" : "Enter an invite code", "error");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await createFamily(text.trim());
        toast("Family created!", "success");
      } else {
        await joinFamily(text.trim().toUpperCase());
        toast("Joined family!", "success");
      }
      setMode(null);
      setText("");
      await load(true);
    } catch (e) {
      toast(errMessage(e, "Action failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    toast("Invite code copied", "success");
  };

  if (loading) {
    return (
      <View style={styles.center} testID="family-loading">
        <ActivityIndicator color={colors.purple} />
      </View>
    );
  }

  // Not in a family — show create / join.
  if (!data || !data.in_family) {
    return (
      <View style={styles.emptyRoot}>
        <View style={{ paddingTop: insets.top + spacing.xxl }} />
        <EmptyState icon="users" color={colors.purple} title="Start your guardian circle" subtitle="Create a family and invite up to 5 people, or join one with an invite code." />
        <View style={styles.emptyActions}>
          {mode === null ? (
            <>
              <NeonButton label="Create a family" color={colors.purple} icon="plus" onPress={() => setMode("create")} testID="family-create-button" />
              <NeonButton label="Join with code" variant="ghost" color={colors.purple} icon="log-in" onPress={() => setMode("join")} testID="family-join-button" />
            </>
          ) : (
            <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={16}>
              <GlassCard borderColor={colors.borderPurple} style={{ gap: spacing.md }}>
                <Field
                  label={mode === "create" ? "FAMILY NAME" : "INVITE CODE"}
                  icon={mode === "create" ? "users" : "hash"}
                  placeholder={mode === "create" ? "e.g. Sharma Family" : "6-character code"}
                  autoCapitalize={mode === "join" ? "characters" : "words"}
                  value={text}
                  onChangeText={setText}
                  testID="family-input"
                />
                <NeonButton label={mode === "create" ? "Create" : "Join"} color={colors.purple} onPress={submit} loading={busy} testID="family-submit-button" />
                <Pressable onPress={() => { setMode(null); setText(""); }} testID="family-cancel-button" style={styles.cancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </GlassCard>
            </KeyboardAvoidingView>
          )}
        </View>
      </View>
    );
  }

  const members: FamilyMember[] = data.members;

  return (
    <View style={styles.root}>
      <FamilyMap members={members} zones={zones} />

      <View style={[styles.floatHeader, { top: insets.top + spacing.sm }]}>
        <GlassCard borderColor={colors.borderPurple} style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.familyName} numberOfLines={1}>{data.name}</Text>
            <Text style={styles.familySub}>{members.length}/{data.max_members} members</Text>
          </View>
          <Chip label={data.invite_code} color={colors.purple} tintBg={tint.purple} icon="copy" onPress={() => copyCode(data.invite_code)} testID="family-invite-chip" />
        </GlassCard>
      </View>

      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={{ backgroundColor: colors.textDim }}
      >
        <BottomSheetView style={[styles.sheetContent, { paddingBottom: insets.bottom + spacing.xxxl }]}>
          <Text style={styles.sheetTitle}>Family members</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {members.map((m) => (
              <View key={m.member_id} style={styles.memberRow} testID={`family-member-${m.member_id}`}>
                <View style={[styles.avatar, { backgroundColor: m.is_me ? tint.cyan : tint.purple }]}>
                  <Text style={[styles.avatarText, { color: m.is_me ? colors.cyan : colors.purple }]}>
                    {m.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}{m.is_me ? " (You)" : ""}</Text>
                  <Text style={styles.memberMeta}>
                    {m.role === "guardian" ? "Guardian · " : ""}{sinceLabel(m.last_seen)}
                  </Text>
                </View>
                {m.battery != null && (
                  <View style={styles.battery}>
                    <Feather name="battery" size={14} color={m.battery < 20 ? colors.red : colors.green} />
                    <Text style={[styles.batteryText, { color: m.battery < 20 ? colors.red : colors.textMuted }]}>{m.battery}%</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  emptyRoot: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, justifyContent: "center" },
  emptyActions: { gap: spacing.md, marginTop: spacing.lg },
  cancel: { alignItems: "center", paddingVertical: spacing.xs },
  cancelText: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base },
  floatHeader: { position: "absolute", left: spacing.lg, right: spacing.lg },
  headerCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  familyName: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xl },
  familySub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm },
  sheetBg: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  sheetContent: { flex: 1, paddingHorizontal: spacing.lg },
  sheetTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginBottom: spacing.md },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display, fontSize: fontSize.lg },
  memberName: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  memberMeta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  battery: { flexDirection: "row", alignItems: "center", gap: 4 },
  batteryText: { fontFamily: fonts.displayMedium, fontSize: fontSize.sm },
});
