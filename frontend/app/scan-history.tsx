import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { listAlerts, listIncidents } from "@/src/api/endpoints";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

interface Entry {
  id: string;
  source: "incident" | "alert";
  label: string;
  detail?: string;
  lat?: number;
  lng?: number;
  when?: string;
}

const TYPE_LABEL: Record<string, string> = {
  wrong_parking: "Wrong parking reported",
  accident: "Accident reported",
  theft: "Theft reported",
  found: "Someone found your item",
  seen: "Item spotted",
  other: "Scan report",
};

function pick<T = any>(o: any, keys: string[]): T | undefined {
  for (const k of keys) if (o?.[k] != null) return o[k];
  return undefined;
}

function relTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ScanHistory() {
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [inc, alerts] = await Promise.all([
          listIncidents().catch(() => ({ count: 0, results: [] })),
          listAlerts().catch(() => []),
        ]);
        const fromInc: Entry[] = (inc.results || []).map((r: any, i: number) => {
          const t = pick<string>(r, ["type", "kind", "reason"]) || "other";
          return {
            id: r.id ?? `inc-${i}`,
            source: "incident",
            label: TYPE_LABEL[t] ?? "Scan report",
            detail: pick<string>(r, ["scanner_note", "message", "note", "status"]),
            lat: pick<number>(r, ["scanner_lat", "latitude", "lat"]),
            lng: pick<number>(r, ["scanner_lng", "longitude", "lng"]),
            when: pick<string>(r, ["created_at", "createdAt", "time"]),
          };
        });
        const fromAlerts: Entry[] = (alerts || []).map((a: any, i: number) => {
          const t = pick<string>(a, ["type", "kind"]) || "";
          return {
            id: a.id ?? `al-${i}`,
            source: "alert",
            label: TYPE_LABEL[t] ?? pick<string>(a, ["title"]) ?? "Alert",
            detail: pick<string>(a, ["message", "scanner_note", "note"]),
            lat: pick<number>(a, ["scanner_lat", "latitude", "lat"]),
            lng: pick<number>(a, ["scanner_lng", "longitude", "lng"]),
            when: pick<string>(a, ["created_at", "createdAt", "time"]),
          };
        });
        const all = [...fromInc, ...fromAlerts].sort((x, y) => (y.when || "").localeCompare(x.when || ""));
        setEntries(all);
      } catch (e) {
        toast(errMessage(e, "Could not load history"), "error");
        setEntries([]);
      }
    })();
  }, []);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Scan history" subtitle="Who reached out via your QR" onBack={() => router.back()} accent={colors.teal} />
      {entries === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.teal} /></View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="clock" color={colors.teal} title="No scans yet" subtitle="When someone scans your vehicle, tag or card, their report appears here with time and location." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {entries.map((e) => (
            <GlassCard key={`${e.source}-${e.id}`} style={styles.card} testID={`scan-history-${e.id}`}>
              <View style={[styles.bubble, { backgroundColor: e.source === "incident" ? tint.red : tint.teal }]}>
                <Feather name={e.source === "incident" ? "alert-triangle" : "bell"} size={18} color={e.source === "incident" ? colors.red : colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{e.label}</Text>
                {!!e.detail && <Text style={styles.detail}>{e.detail}</Text>}
                <View style={styles.metaRow}>
                  {!!e.when && <Text style={styles.meta}>{relTime(e.when)}</Text>}
                  {e.lat != null && e.lng != null && (
                    <Text style={styles.meta}>📍 {Number(e.lat).toFixed(3)}, {Number(e.lng).toFixed(3)}</Text>
                  )}
                </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  bubble: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  detail: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: 4 },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
});
