import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { listSosEvents } from "@/src/api/endpoints";
import { SosEvent } from "@/src/api/types";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

function fmt(iso: string): string {
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SosEvents() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<SosEvent[] | null>(null);

  useEffect(() => {
    listSosEvents().then(setItems).catch((e) => toast(errMessage(e), "error"));
  }, []);

  return (
    <View style={styles.root}>
      <ScreenHeader title="SOS history" subtitle="Your past alerts" onBack={() => router.back()} accent={colors.red} />
      {items === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="check-circle" color={colors.green} title="No SOS alerts" subtitle="You haven't triggered any SOS. Stay safe!" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((e) => (
            <GlassCard key={e.id} borderColor={colors.borderRed} style={styles.card} testID={`sos-${e.id}`}>
              <View style={styles.headerRow}>
                <View style={[styles.bubble, { backgroundColor: tint.red }]}>
                  <Feather name="alert-octagon" size={18} color={colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>SOS triggered</Text>
                  <Text style={styles.meta}>{fmt(e.created_at)}</Text>
                </View>
                <Chip
                  label={e.acknowledged ? "Acknowledged" : e.escalated ? "Escalated" : "Sent"}
                  color={e.acknowledged ? colors.green : e.escalated ? colors.amber : colors.red}
                  tintBg={e.acknowledged ? tint.green : e.escalated ? tint.amber : tint.red}
                />
              </View>
              <Text style={styles.detail}>{e.notified} guardian(s) notified via {e.channels.join(", ")}</Text>
              <Text style={styles.coords}>📍 {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}</Text>
            </GlassCard>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { gap: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  detail: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm },
  coords: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
});
