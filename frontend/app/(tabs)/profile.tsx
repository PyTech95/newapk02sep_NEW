import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errMessage } from "@/src/api/client";
import { updateMe } from "@/src/api/endpoints";
import { NotifyPrefs } from "@/src/api/types";
import { Field } from "@/src/components/Field";
import { Chip } from "@/src/components/Chip";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { OverlayForm } from "@/src/components/OverlayForm";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

const BANNER = "https://images.unsplash.com/photo-1628763228722-b11a9c545ed7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxjeWJlcnNlY3VyaXR5JTIwbG9jayUyMG5lb24lMjBkYXJrfGVufDB8fHx8MTc4NzczNzA0Mnww&ixlib=rb-4.1.0&q=85";

const PREF_ROWS: { key: keyof NotifyPrefs; label: string; sub: string }[] = [
  { key: "whatsapp", label: "WhatsApp alerts", sub: "SOS & incident notifications" },
  { key: "push", label: "Push notifications", sub: "In-app push alerts" },
  { key: "email", label: "Email alerts", sub: "Summaries and reports" },
  { key: "incident_alerts", label: "Incident alerts", sub: "Reports on your QR items" },
  { key: "speed_alerts", label: "Speed alerts", sub: "Vehicle over-speed warnings" },
];

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingPref, setSavingPref] = useState<string | null>(null);

  if (!user) return null;

  const saveProfile = async () => {
    if (!name.trim()) { toast("Name cannot be empty", "error"); return; }
    setBusy(true);
    try {
      await updateMe({ name: name.trim(), phone: phone.trim() });
      await refreshUser();
      toast("Profile updated", "success");
      setEdit(false);
    } catch (e) {
      toast(errMessage(e, "Could not update"), "error");
    } finally { setBusy(false); }
  };

  const togglePref = async (key: keyof NotifyPrefs, value: boolean) => {
    setSavingPref(key);
    try {
      await updateMe({ notify_prefs: { [key]: value } });
      await refreshUser();
    } catch (e) {
      toast(errMessage(e, "Could not save"), "error");
    } finally { setSavingPref(null); }
  };

  const setEscalation = async (seconds: number) => {
    try {
      await updateMe({ escalate_seconds: seconds });
      await refreshUser();
      toast("Escalation delay updated", "success");
    } catch (e) {
      toast(errMessage(e, "Could not save"), "error");
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Image source={{ uri: BANNER }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.bannerOverlay} />
          <View style={[styles.avatar, { marginTop: insets.top }]}>
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.phone}>{user.phone}</Text>
        </View>

        <View style={styles.body}>
          <NeonButton label="Edit profile" variant="ghost" color={colors.cyan} icon="edit-2" onPress={() => { setName(user.name); setPhone(user.phone); setEdit(true); }} testID="profile-edit-button" />

          <Text style={styles.sectionTitle}>Notifications</Text>
          <GlassCard padded={false} style={{ overflow: "hidden" }}>
            {PREF_ROWS.map((row, i) => (
              <View key={row.key} style={[styles.prefRow, i > 0 && styles.prefBorder]} testID={`pref-${row.key}`}>
                <View style={[styles.prefIcon, { backgroundColor: tint.cyan }]}>
                  <Feather name="bell" size={16} color={colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefLabel}>{row.label}</Text>
                  <Text style={styles.prefSub}>{row.sub}</Text>
                </View>
                <Switch
                  value={!!user.notify_prefs[row.key]}
                  disabled={savingPref === row.key}
                  onValueChange={(v) => togglePref(row.key, v)}
                  trackColor={{ true: colors.cyan, false: colors.border }}
                  thumbColor="#fff"
                  testID={`pref-switch-${row.key}`}
                />
              </View>
            ))}
          </GlassCard>

          <Text style={styles.sectionTitle}>SOS escalation delay</Text>
          <GlassCard style={styles.escCard} testID="escalation-card">
            <Text style={styles.escHint}>How long to wait for an acknowledgement before alerting the next contact.</Text>
            <View style={styles.escRow}>
              {[{ m: 1, s: 60 }, { m: 3, s: 180 }, { m: 5, s: 300 }].map((o) => (
                <Chip
                  key={o.s}
                  label={`${o.m} min`}
                  color={colors.red}
                  tintBg={tint.red}
                  active={(user.escalate_seconds ?? 120) === o.s}
                  onPress={() => setEscalation(o.s)}
                  testID={`escalation-${o.m}`}
                />
              ))}
            </View>
          </GlassCard>

          <Text style={styles.sectionTitle}>Account</Text>
          <GlassCard style={styles.aboutCard}>
            <Text style={styles.brand}>Nek<Text style={{ color: colors.cyan }}>Sathi</Text></Text>
            <Text style={styles.tagline}>Har Musibat Mein, Ek Nek Sathi</Text>
          </GlassCard>

          <NeonButton label="Log out" variant="danger" icon="log-out" onPress={logout} testID="logout-button" />
        </View>
      </ScrollView>

      <OverlayForm visible={edit} title="Edit profile" color={colors.cyan} submitLabel="Save" busy={busy} onClose={() => setEdit(false)} onSubmit={saveProfile} testID="profile-form">
        <Field label="NAME" icon="user" placeholder="Your name" value={name} onChangeText={setName} testID="profile-name-input" />
        <Field label="PHONE" icon="phone" placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="profile-phone-input" />
      </OverlayForm>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxxl },
  banner: { alignItems: "center", paddingBottom: spacing.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  bannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6,6,15,0.72)" },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceTertiary, borderWidth: 2, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarText: { color: colors.cyan, fontFamily: fonts.display, fontSize: 34 },
  name: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl },
  email: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base, marginTop: 2 },
  phone: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  body: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg, marginTop: spacing.md },
  prefRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  prefBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  prefIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  prefLabel: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  prefSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 1 },
  aboutCard: { alignItems: "center", gap: 4 },
  escCard: { gap: spacing.md },
  escHint: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  escRow: { flexDirection: "row", gap: spacing.sm },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl },
  tagline: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm },
});
