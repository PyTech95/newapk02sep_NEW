import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/src/components/EmptyState";
import { GlassCard } from "@/src/components/GlassCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { getReceipts, Receipt } from "@/src/services/receipts";
import { colors, fonts, fontSize, spacing, tint } from "@/src/theme";

export default function Receipts() {
  const router = useRouter();
  const [items, setItems] = useState<Receipt[] | null>(null);

  useEffect(() => {
    getReceipts().then(setItems);
  }, []);

  const onExport = async () => {
    if (!items || items.length === 0) return;
    const lines = items.map(
      (r) => `• ${r.item} — ₹${r.amount || "0"} to ${r.finderUpi || "finder"} on ${new Date(r.date).toLocaleDateString()}`,
    );
    const total = items.reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);
    await Share.share({
      title: "NekSathi recovery receipts",
      message: `NekSathi — Recovery Receipts\n\n${lines.join("\n")}\n\nTotal rewards paid: ₹${total}`,
    });
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Recovery receipts"
        subtitle="Rewards you've paid"
        onBack={() => router.back()}
        accent={colors.green}
        right={
          items && items.length > 0 ? (
            <Pressable testID="receipts-export-button" onPress={onExport} hitSlop={10}>
              <Feather name="share" size={22} color={colors.green} />
            </Pressable>
          ) : undefined
        }
      />
      {items === null ? null : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="award" color={colors.green} title="No receipts yet" subtitle="When you recover a lost item and pay the finder, a receipt is saved here." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((r) => (
            <GlassCard key={r.id} style={styles.card} testID={`receipt-${r.id}`}>
              <View style={[styles.bubble, { backgroundColor: tint.green }]}>
                <Feather name="gift" size={18} color={colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{r.item}</Text>
                <Text style={styles.meta}>{r.finderUpi || "no UPI"} · {new Date(r.date).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}</Text>
              </View>
              <View style={styles.amountWrap}>
                <Text style={styles.amount}>₹{r.amount || "0"}</Text>
                <Text style={[styles.status, { color: r.paid ? colors.green : colors.textDim }]}>{r.paid ? "paid" : "logged"}</Text>
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
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.base },
  meta: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: 2 },
  amountWrap: { alignItems: "flex-end" },
  amount: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xl },
  status: { fontFamily: fonts.displayMedium, fontSize: fontSize.sm },
});
