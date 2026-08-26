import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { scanUrl } from "@/src/api/endpoints";
import { GlassCard } from "@/src/components/GlassCard";
import { NeonButton } from "@/src/components/NeonButton";
import { useToast } from "@/src/context/ToastContext";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

export default function QrDetail() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { qrId, title, subtitle, color } = useLocalSearchParams<{ qrId: string; title: string; subtitle?: string; color?: string }>();
  const url = scanUrl(qrId);
  const accent = color || colors.teal;

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    toast("Scan link copied", "success");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable testID="qr-close-button" onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Smart QR</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.center}>
        <GlassCard borderColor={`${accent}66`} style={styles.card}>
          <View style={styles.qrBox} testID="qr-code">
            <QRCode value={url} size={220} backgroundColor="#ffffff" color="#06060f" />
          </View>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <Text style={styles.help}>Anyone can scan this to reach you privately — no app needed.</Text>
        </GlassCard>

        <View style={styles.actions}>
          <NeonButton label="Copy scan link" variant="ghost" color={accent} icon="copy" onPress={copy} testID="qr-copy-button" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.md },
  headerTitle: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xl },
  center: { flex: 1, justifyContent: "center", gap: spacing.xl },
  card: { alignItems: "center", gap: spacing.md },
  qrBox: { padding: spacing.lg, backgroundColor: "#fff", borderRadius: spacing.md },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.xxl, textAlign: "center" },
  subtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center" },
  help: { color: colors.textDim, fontFamily: fonts.body, fontSize: fontSize.sm, textAlign: "center", marginTop: spacing.xs },
  actions: { gap: spacing.md },
});
