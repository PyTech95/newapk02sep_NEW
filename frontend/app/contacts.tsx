import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { addContact, deleteContact, listContacts } from "@/src/api/endpoints";
import { EmergencyContact } from "@/src/api/types";
import { EmptyState } from "@/src/components/EmptyState";
import { Field } from "@/src/components/Field";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { OverlayForm } from "@/src/components/OverlayForm";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

export default function Contacts() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<EmergencyContact[] | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");

  const load = () => listContacts().then(setItems).catch((e) => toast(errMessage(e), "error"));
  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    if (!name.trim() || !phone.trim()) {
      toast("Name and phone are required", "error");
      return;
    }
    setBusy(true);
    try {
      await addContact(name.trim(), phone.trim(), relation.trim() || undefined);
      toast("Contact added", "success");
      setShow(false);
      setName(""); setPhone(""); setRelation("");
      load();
    } catch (e) {
      toast(errMessage(e, "Could not add contact"), "error");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteContact(id);
      toast("Contact removed", "info");
      load();
    } catch (e) {
      toast(errMessage(e, "Could not remove"), "error");
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Emergency contacts"
        subtitle="Alerted first in an SOS"
        onBack={() => router.back()}
        accent={colors.purple}
        right={<Pressable testID="contacts-add-header" onPress={() => setShow(true)} hitSlop={10}><Feather name="plus" size={24} color={colors.purple} /></Pressable>}
      />
      {items === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="user-plus" color={colors.purple} title="No contacts yet" subtitle="Add people who should be alerted when you trigger an SOS." />
          <View style={styles.emptyBtn}><NeonButton label="Add contact" color={colors.purple} icon="plus" onPress={() => setShow(true)} testID="contacts-add-empty" /></View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((c) => (
            <GlassCard key={c.id} style={styles.row} testID={`contact-${c.id}`}>
              <View style={[styles.avatar, { backgroundColor: tint.purple }]}>
                <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.meta}>{c.phone}{c.relation ? ` · ${c.relation}` : ""}</Text>
              </View>
              <Pressable testID={`contact-delete-${c.id}`} onPress={() => onDelete(c.id)} hitSlop={10}>
                <Feather name="trash-2" size={20} color={colors.red} />
              </Pressable>
            </GlassCard>
          ))}
        </ScrollView>
      )}

      <OverlayForm visible={show} title="Add contact" color={colors.purple} submitLabel="Add" busy={busy} onClose={() => setShow(false)} onSubmit={onAdd} testID="contacts-form">
        <Field label="NAME" icon="user" placeholder="Contact name" value={name} onChangeText={setName} testID="contact-name-input" />
        <Field label="PHONE" icon="phone" placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="contact-phone-input" />
        <Field label="RELATION (optional)" icon="heart" placeholder="e.g. Sister" value={relation} onChangeText={setRelation} testID="contact-relation-input" />
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
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.purple, fontFamily: fonts.display, fontSize: fontSize.lg },
  name: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
});
