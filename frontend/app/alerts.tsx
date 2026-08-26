import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { listAlerts, listIncidents } from "@/src/api/endpoints";
import { AlertItem, Incident } from "@/src/api/types";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing, tint } from "@/src/theme";

type Tab = "alerts" | "incidents";

export default function Alerts() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("alerts");
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);

  useEffect(() => {
    listAlerts().then(setAlerts).catch((e) => { setAlerts([]); toast(errMessage(e), "error"); });
    listIncidents().then((r) => setIncidents(r.results)).catch(() => setIncidents([]));
  }, []);

  const data = tab === "alerts" ? alerts : incidents;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Alerts & incidents" subtitle="Stay informed" onBack={() => router.back()} accent={colors.amber} />
      <View style={styles.segment}>
        {(["alerts", "incidents"] as Tab[]).map((t) => (
          <Pressable key={t} testID={`alerts-tab-${t}`} onPress={() => setTab(t)} style={[styles.segItem, tab === t && styles.segActive]}>
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>{t === "alerts" ? "Alerts" : "Incidents"}</Text>
          </Pressable>
        ))}
      </View>

      {data === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.amber} /></View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="bell-off" color={colors.amber} title={`No ${tab}`} subtitle={tab === "alerts" ? "You have no active alerts right now." : "No incidents have been reported."} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {data.map((item: any, i: number) => (
            <GlassCard key={item.id ?? i} style={styles.card} testID={`alert-item-${i}`}>
              <View style={[styles.bubble, { backgroundColor: tint.amber }]}>
                <Feather name={tab === "alerts" ? "bell" : "alert-triangle"} size={18} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title ?? item.type ?? item.kind ?? (tab === "alerts" ? "Alert" : "Incident")}</Text>
                {item.message && <Text style={styles.meta}>{item.message}</Text>}
                {item.status && <Text style={styles.meta}>Status: {item.status}</Text>}
              </View>
            </GlassCard>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segment: { flexDirection: "row", margin: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.pill },
  segActive: { backgroundColor: colors.amber },
  segText: { color: colors.textDim, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  segTextActive: { color: "#03030a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
});
