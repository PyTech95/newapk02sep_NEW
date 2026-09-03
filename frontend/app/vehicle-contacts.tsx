import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { addVehicleContact, deleteVehicleContact, listVehicleContacts, VehicleContact } from "@/src/api/endpoints";
import { EmptyState } from "@/src/components/EmptyState";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { OverlayForm } from "@/src/components/OverlayForm";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

export default function VehicleContacts() {
  const router = useRouter();
  const toast = useToast();
  const { vehicleId, plate } = useLocalSearchParams<{ vehicleId?: string; plate?: string }>();

  const [contacts, setContacts] = useState<VehicleContact[] | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [emergency, setEmergency] = useState(true);
  const [speed, setSpeed] = useState(false);
  const [parking, setParking] = useState(false);

  const load = useCallback(() => {
    if (!vehicleId) return;
    listVehicleContacts(String(vehicleId))
      .then(setContacts)
      .catch((e) => {
        setContacts([]);
        toast(errMessage(e, "Could not load family members"), "error");
      });
  }, [vehicleId, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setName(""); setPhone(""); setRelation("");
    setEmergency(true); setSpeed(false); setParking(false);
  };

  const onAdd = async () => {
    if (!name.trim()) { toast("Enter a name", "error"); return; }
    if (!phone.trim()) { toast("Enter a phone number", "error"); return; }
    setBusy(true);
    try {
      await addVehicleContact(String(vehicleId), {
        name: name.trim(),
        phone: phone.trim(),
        relation: relation.trim() || null,
        receives_emergency: emergency,
        receives_speed_alert: speed,
        receives_parking: parking,
      });
      toast("Family member added", "success");
      setShow(false);
      resetForm();
      load();
    } catch (e) {
      toast(errMessage(e, "Could not add"), "error");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (c: VehicleContact) => {
    try {
      await deleteVehicleContact(String(vehicleId), c.id);
      toast("Removed", "info");
      load();
    } catch (e) {
      toast(errMessage(e, "Could not remove"), "error");
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Family members"
        subtitle={plate ? `Alert contacts for ${plate}` : "People alerted for this vehicle"}
        accent={colors.purple}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GlassCard borderColor={colors.borderPurple} style={styles.infoBanner}>
          <Feather name="info" size={16} color={colors.purple} />
          <Text style={styles.infoText}>
            Add family members who should be alerted when this vehicle is reported — an accident, wrong parking, or if it&apos;s marked lost.
          </Text>
        </GlassCard>

        {contacts === null ? (
          <View style={styles.pad}><ActivityIndicator color={colors.purple} /></View>
        ) : contacts.length === 0 ? (
          <EmptyState icon="users" color={colors.purple} title="No family members" subtitle="Add someone who should be notified about this vehicle." />
        ) : (
          contacts.map((c) => (
            <GlassCard key={c.id} style={styles.card} testID={`vcontact-${c.id}`}>
              <View style={styles.cardHead}>
                <View style={[styles.bubble, { backgroundColor: tint.purple }]}>
                  <Feather name="user" size={20} color={colors.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>
                    {c.phone}
                    {c.relation ? ` · ${c.relation}` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => onDelete(c)} hitSlop={10} testID={`vcontact-del-${c.id}`}>
                  <Feather name="trash-2" size={18} color={colors.red} />
                </Pressable>
              </View>
              <View style={styles.tagRow}>
                {c.receives_emergency ? <Tag label="Emergency" /> : null}
                {c.receives_speed_alert ? <Tag label="Speed" /> : null}
                {c.receives_parking ? <Tag label="Parking" /> : null}
              </View>
            </GlassCard>
          ))
        )}

        <NeonButton label="Add family member" color={colors.purple} icon="user-plus" onPress={() => setShow(true)} testID="vcontact-add" />
      </ScrollView>

      <OverlayForm
        visible={show}
        title="Add family member"
        color={colors.purple}
        submitLabel="Add"
        busy={busy}
        onClose={() => { setShow(false); resetForm(); }}
        onSubmit={onAdd}
        testID="vcontact-form"
      >
        <Field label="NAME" icon="user" placeholder="e.g. Ravi Kumar" value={name} onChangeText={setName} testID="vcontact-name" />
        <Field label="PHONE" icon="phone" placeholder="10-digit mobile" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="vcontact-phone" />
        <Field label="RELATION (optional)" icon="heart" placeholder="e.g. brother, spouse" value={relation} onChangeText={setRelation} testID="vcontact-relation" />
        <ToggleRow label="Emergency alerts" sub="Accident & lost reports" value={emergency} onValueChange={setEmergency} testID="vcontact-emergency" />
        <ToggleRow label="Speed alerts" sub="Over-speeding notifications" value={speed} onValueChange={setSpeed} testID="vcontact-speed" />
        <ToggleRow label="Parking alerts" sub="Wrong-parking reports" value={parking} onValueChange={setParking} testID="vcontact-parking" />
      </OverlayForm>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function ToggleRow({ label, sub, value, onValueChange, testID }: { label: string; sub: string; value: boolean; onValueChange: (v: boolean) => void; testID: string }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.purple, false: colors.border }}
        thumbColor="#fff"
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  infoBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoText: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
  pad: { paddingVertical: spacing.xxl, alignItems: "center" },
  card: { gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  tagRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { backgroundColor: tint.purple, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 4 },
  chipText: { color: colors.purple, fontFamily: fonts.displaySemi, fontSize: fontSize.sm },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  toggleLabel: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  toggleSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 1 },
});
