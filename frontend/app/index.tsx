import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, fontSize, spacing } from "@/src/theme";

export default function Index() {
  const { user, bootstrapping } = useAuth();

  if (bootstrapping) {
    return (
      <View style={styles.container} testID="boot-splash">
        <Text style={styles.brand}>
          Nek<Text style={{ color: colors.cyan }}>Sathi</Text>
        </Text>
        <Text style={styles.tagline}>Har Musibat Mein, Ek Nek Sathi</Text>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  return <Redirect href={user ? "/(tabs)" : "/(auth)/login"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: 42, letterSpacing: 1 },
  tagline: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base, marginTop: spacing.sm },
});
