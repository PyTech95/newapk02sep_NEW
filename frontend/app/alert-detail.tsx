import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { listAlerts } from "@/src/api/endpoints";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { ScanMap } from "@/src/components/ScanMap";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

export default function AlertDetail() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    id?: string;
    label?: string;
    type?: string;
    lat?: string;
    lng?: string;
    phone?: string;
    note?: string;
    created?: string;
  }>();

  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!p.id) return;
    listAlerts()
      .then((all) => {
        const a: any = Array.isArray(all) ? all.find((x: any) => x.id === p.id) : null;
        if (a?.evidence_photo_base64) setPhoto(a.evidence_photo_base64 as string);
      })
      .catch(() => {});
  }, [p.id]);

  const lat = p.lat ? Number(p.lat) : null;
  const lng = p.lng ? Number(p.lng) : null;
  const hasLoc = lat != null && !Number.isNaN(lat) && lng != null && !Number.isNaN(lng);
  const type = String(p.type || "alert").replace(/_/g, " ");
  const when = p.created ? new Date(p.created).toLocaleString() : "";

  const openMaps = () => {
    if (!hasLoc) return;
    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${lat},${lng}&q=Finder`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url!);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Alert detail" subtitle={p.label || ""} accent={colors.amber} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.card}>
          <View style={styles.headRow}>
            <View style={[styles.badge, { backgroundColor: `${colors.amber}22` }]}>
              <Text style={[styles.badgeText, { color: colors.amber }]}>{type}</Text>
            </View>
            {when ? <Text style={styles.time}>{when}</Text> : null}
          </View>
          {p.note ? <Text style={styles.note}>&ldquo;{p.note}&rdquo;</Text> : <Text style={styles.noteMuted}>No note left by the finder.</Text>}
        </GlassCard>

        {photo ? (
          <GlassCard style={styles.card} padded={false}>
            <Image
              source={{ uri: photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}` }}
              style={styles.photo}
              resizeMode="cover"
            />
          </GlassCard>
        ) : null}

        {hasLoc ? (
          <GlassCard style={styles.mapCard} padded={false}>
            <View style={styles.mapWrap}>
              <ScanMap points={[{ id: "finder", lat: lat!, lng: lng!, label: "Finder location", when, danger: true }]} />
            </View>
            <View style={styles.mapFoot}>
              <Feather name="map-pin" size={16} color={colors.teal} />
              <Text style={styles.coords}>
                {lat!.toFixed(5)}, {lng!.toFixed(5)}
              </Text>
              <Text style={styles.openLink} onPress={openMaps}>
                Open in Maps
              </Text>
            </View>
          </GlassCard>
        ) : (
          <GlassCard style={styles.card}>
            <Text style={styles.noteMuted}>The finder didn&apos;t share a location.</Text>
          </GlassCard>
        )}

        {p.phone ? (
          <NeonButton
            label={`Call finder (${p.phone})`}
            color={colors.green}
            icon="phone"
            onPress={() => Linking.openURL(`tel:${String(p.phone).replace(/\s+/g, "")}`)}
            testID="alert-call-finder"
          />
        ) : (
          <Text style={styles.privacy}>The finder didn&apos;t share a phone number.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { gap: spacing.sm },
  photo: { width: "100%", height: 220, borderRadius: radius.lg },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.displaySemi, fontSize: fontSize.sm, textTransform: "capitalize" },
  time: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm },
  note: { color: colors.text, fontFamily: fonts.body, fontSize: fontSize.base, lineHeight: 22 },
  noteMuted: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.base },
  mapCard: { overflow: "hidden" },
  mapWrap: { height: 240, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  mapFoot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  coords: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.sm },
  openLink: { color: colors.teal, fontFamily: fonts.displaySemi, fontSize: fontSize.sm },
  privacy: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, textAlign: "center" },
});
