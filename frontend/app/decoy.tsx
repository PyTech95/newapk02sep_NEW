import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator } from "react-native";

import { startGuardian } from "@/src/services/backgroundLocation";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

// A decoy "powering off" screen. It looks like the phone is shutting down but
// keeps NekSathi's Guardian location tracking running. NOTE: this cannot
// intercept the real power button — it's an in-app decoy the user activates.
export default function Decoy() {
  const router = useRouter();
  const [phase, setPhase] = useState<"off" | "black">("off");

  useEffect(() => {
    startGuardian().catch(() => {});
    const t = setTimeout(() => setPhase("black"), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <Pressable style={styles.root} onLongPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/security"))} delayLongPress={1500} testID="decoy-screen">
      {phase === "off" ? (
        <View style={styles.center}>
          <ActivityIndicator color="#888" size="large" />
          <Text style={styles.off}>Shutting down…</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.hidden}>Long-press anywhere for 1.5s to exit</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", gap: spacing.lg },
  off: { color: "#9a9a9a", fontFamily: fonts.body, fontSize: fontSize.lg },
  hidden: { color: "rgba(255,255,255,0.06)", fontFamily: fonts.body, fontSize: 11 },
});
