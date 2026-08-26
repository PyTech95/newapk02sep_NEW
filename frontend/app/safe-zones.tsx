import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { addSafeZone, deleteSafeZone, listSafeZones } from "@/src/api/endpoints";
import { SafeZone } from "@/src/api/types";
import { EmptyState } from "@/src/components/EmptyState";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { OverlayForm } from "@/src/components/OverlayForm";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";
import { requestLocation } from "@/src/utils/location";

export default function SafeZones() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<SafeZone[] | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState("300");
  const [locating, setLocating] = useState(false);

  const load = () => listSafeZones().then(setItems).catch((e) => toast(errMessage(e), "error"));
  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    if (!name.trim()) {
      toast("Enter a zone name", "error");
      return;
    }
    setBusy(true);
    setLocating(true);
    const loc = await requestLocation();
    setLocating(false);
    if (!loc.coords) {
      toast(loc.error ?? "Location needed to set a zone", "error");
      setBusy(false);
      return;
    }
    try {
      await addSafeZone(name.trim(), loc.coords.latitude, loc.coords.longitude, parseInt(radius, 10) || 300);
      toast("Safe zone added at your location", "success");
      setShow(false);
      setName(""); setRadius("300");
      load();
    } catch (e) {
      toast(errMessage(e, "Could not add zone"), "error");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteSafeZone(id);
      toast("Zone removed", "info");
      load();
    } catch (e) {
      toast(errMessage(e, "Could not remove"), "error");
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Safe zones"
        subtitle="Arrive & leave alerts"
        onBack={() => router.back()}
        accent={colors.teal}
        right={<Pressable testID="zone-add-header" onPress={() => setShow(true)} hitSlop={10}><Feather name="plus" size={24} color={colors.teal} /></Pressable>}
      />
      {items === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.teal} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="map-pin" color={colors.teal} title="No safe zones" subtitle="Add places like Home or School. We'll notify when you arrive or leave." />
          <View style={styles.emptyBtn}><NeonButton label="Add safe zone" color={colors.teal} icon="plus" onPress={() => setShow(true)} testID="zone-add-empty" /></View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((z) => (
            <GlassCard key={z.id} borderColor={colors.borderTeal} style={styles.row} testID={`zone-${z.id}`}>
              <View style={[styles.bubble, { backgroundColor: tint.teal }]}>
                <Feather name="map-pin" size={20} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{z.name}</Text>
                <Text style={styles.meta}>Radius {z.radius_m}m · {z.notify ? "Alerts on" : "Alerts off"}</Text>
              </View>
              <Pressable testID={`zone-delete-${z.id}`} onPress={() => onDelete(z.id)} hitSlop={10}>
                <Feather name="trash-2" size={20} color={colors.red} />
              </Pressable>
            </GlassCard>
          ))}
        </ScrollView>
      )}

      <OverlayForm visible={show} title="Add safe zone" color={colors.teal} submitLabel={locating ? "Getting location…" : "Add at my location"} busy={busy} onClose={() => setShow(false)} onSubmit={onAdd} testID="zone-form">
        <Field label="ZONE NAME" icon="home" placeholder="e.g. Home" value={name} onChangeText={setName} testID="zone-name-input" />
        <Field label="RADIUS (meters)" icon="target" placeholder="300" keyboardType="number-pad" value={radius} onChangeText={setRadius} testID="zone-radius-input" />
        <Text style={styles.note}>The zone is centered on your current GPS location.</Text>
      </OverlayForm>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  emptyBtn: { width: "100%", paddingHorizontal: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  note: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
});
