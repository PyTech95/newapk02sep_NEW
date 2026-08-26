import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { parseQrValue } from "@/src/api/endpoints";
import { EmptyState } from "@/src/components/EmptyState";
import { NeonButton } from "@/src/components/NeonButton";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);

  const onScan = ({ data }: { data: string }) => {
    if (scanned.current || !data) return;
    scanned.current = true;
    const qrId = parseQrValue(data);
    router.replace({ pathname: "/scan-report", params: { qrId } });
  };

  const header = (
    <View style={[styles.header, { top: insets.top + spacing.sm }]}>
      <Pressable testID="scan-close-button" onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
        <Feather name="x" size={24} color="#fff" />
      </Pressable>
      <Text style={styles.headerTitle}>Scan a NekSathi QR</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // Permission gate
  if (!permission) {
    return <View style={styles.root} testID="scan-loading" />;
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.root, styles.center]} testID="scan-permission">
        <EmptyState
          icon="camera"
          color={colors.teal}
          title="Camera access needed"
          subtitle="Point your camera at a NekSathi QR on a bag, vehicle or card to help return it to its owner — privately."
        />
        <View style={styles.permActions}>
          {blocked ? (
            <NeonButton label="Open Settings" color={colors.teal} icon="settings" onPress={() => Linking.openSettings()} testID="scan-open-settings" />
          ) : (
            <NeonButton label="Enable camera" color={colors.teal} icon="camera" onPress={requestPermission} testID="scan-enable-camera" />
          )}
          <NeonButton label="Cancel" variant="ghost" color={colors.textMuted} onPress={() => router.back()} testID="scan-cancel" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScan}
        testID="scan-camera"
      />
      <View style={styles.overlay} pointerEvents="box-none">
        {header}
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>Align the QR inside the box</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { backgroundColor: colors.bg, justifyContent: "center", paddingHorizontal: spacing.lg },
  permActions: { width: "100%", paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  overlay: { ...StyleSheet.absoluteFillObject },
  header: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  frame: { width: 240, height: 240, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.teal, backgroundColor: "rgba(45,212,191,0.06)" },
  hint: { color: "#fff", fontFamily: fonts.body, fontSize: fontSize.base, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
});
