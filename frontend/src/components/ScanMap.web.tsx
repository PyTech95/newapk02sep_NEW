import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, spacing } from "@/src/theme";

export interface ScanPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  when?: string;
  danger?: boolean;
}

// Web fallback — react-native-maps has no web support.
export function ScanMap({ points }: { points: ScanPoint[] }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        source={{ uri: "https://images.pexels.com/photos/8828418/pexels-photo-8828418.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay}>
        <Feather name="map-pin" size={28} color={colors.teal} />
        <Text style={styles.text}>Map view available on the mobile app</Text>
        <Text style={styles.sub}>{points.length} located scan(s)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6,6,15,0.7)", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  text: { color: colors.text, fontFamily: fonts.displaySemi, fontSize: fontSize.lg },
  sub: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSize.base },
});
