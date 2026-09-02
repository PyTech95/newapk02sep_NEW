import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { errMessage } from "@/src/api/client";
import { listAlerts } from "@/src/api/endpoints";
import { AlertItem } from "@/src/api/types";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

const ICON: Record<string, keyof typeof Feather.glyphMap> = {
  wrong_parking: "slash",
  accident: "alert-triangle",
  vehicle_stolen: "shield-off",
  theft: "shield-off",
  vehicle_damage: "alert-octagon",
  window_open: "square",
  missed_call: "phone-missed",
  found: "check-circle",
  lights_on: "sun",
};

const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function AlertsInbox() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<AlertItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listAlerts();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast(errMessage(e, "Could not load alerts"), "error");
      setItems([]);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <ScreenHeader title="Scan Alerts" subtitle="People who reached out via your QR" accent={colors.amber} onBack={() => router.back()} />
      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="bell" color={colors.amber} title="No alerts yet" subtitle="When someone scans your QR and reports something, it'll show up here." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((a) => {
            const type = String(a.type || "alert");
            const lat = a.scanner_lat as number | undefined;
            const lng = a.scanner_lng as number | undefined;
            const label = (a.number_plate as string) || (a.name as string) || "Your item";
            return (
              <Pressable
                key={a.id}
                testID={`alert-row-${a.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/alert-detail",
                    params: {
                      label,
                      type,
                      lat: lat != null ? String(lat) : "",
                      lng: lng != null ? String(lng) : "",
                      phone: (a.scanner_phone as string) || "",
                      note: (a.scanner_note as string) || "",
                      created: (a.created_at as string) || "",
                    },
                  })
                }
              >
                <GlassCard style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: `${colors.amber}22` }]}>
                    <Feather name={ICON[type] || "bell"} size={20} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{label}</Text>
                    <Text style={styles.rowSub}>
                      {type.replace(/_/g, " ")} · {timeAgo(a.created_at)}
                    </Text>
                  </View>
                  {lat != null && lng != null ? <Feather name="map-pin" size={16} color={colors.teal} style={{ marginRight: 6 }} /> : null}
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
});
