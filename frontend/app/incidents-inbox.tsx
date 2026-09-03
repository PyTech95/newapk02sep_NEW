import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { IncidentDetail, listIncidentDetails } from "@/src/api/endpoints";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";

const ICON: Record<string, keyof typeof Feather.glyphMap> = {
  wrong_parking: "slash",
  accident: "alert-triangle",
  vehicle_stolen: "shield-off",
  theft: "shield-off",
  vehicle_damage: "alert-octagon",
  window_open: "square",
  lights_on: "sun",
};

const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function IncidentsInbox() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<IncidentDetail[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listIncidentDetails();
      setItems(data);
    } catch (e) {
      toast(errMessage(e, "Could not load incidents"), "error");
      setItems([]);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <ScreenHeader title="Alerts" subtitle="People who reported something on your QR" accent={colors.amber} onBack={() => router.back()} />
      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="bell" color={colors.amber} title="No alerts yet" subtitle="When someone scans your QR and reports something, it'll show up here and you can reply." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((a) => {
            const type = String(a.type || "alert");
            const label = a.number_plate || "Your item";
            const needsReply = !a.owner_response && !a.resolved;
            return (
              <Pressable
                key={a.id}
                testID={`incident-row-${a.id}`}
                onPress={() => router.push({ pathname: "/incident-detail", params: { id: a.id } })}
              >
                <GlassCard borderColor={needsReply ? colors.borderAmber : undefined} style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: tint.amber }]}>
                    <Feather name={ICON[type] || "bell"} size={20} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{label}</Text>
                    <Text style={styles.rowSub}>
                      {type.replace(/_/g, " ")} · {timeAgo(a.created_at)}
                    </Text>
                  </View>
                  {a.owner_response === "coming" ? (
                    <View style={[styles.pill, { backgroundColor: tint.green }]}>
                      <Text style={[styles.pillText, { color: colors.green }]}>Coming</Text>
                    </View>
                  ) : a.owner_response === "cant" ? (
                    <View style={[styles.pill, { backgroundColor: tint.red }]}>
                      <Text style={[styles.pillText, { color: colors.red }]}>Can&apos;t</Text>
                    </View>
                  ) : needsReply ? (
                    <View style={[styles.pill, { backgroundColor: tint.amber }]}>
                      <Text style={[styles.pillText, { color: colors.amber }]}>Reply</Text>
                    </View>
                  ) : null}
                  <Feather name="chevron-right" size={20} color={colors.textDim} />
                </GlassCard>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  rowSub: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2, textTransform: "capitalize" },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.displaySemi, fontSize: fontSize.sm },
});
