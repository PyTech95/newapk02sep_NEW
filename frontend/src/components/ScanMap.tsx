import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { colors } from "@/src/theme";

export interface ScanPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  when?: string;
  danger?: boolean;
}

export function ScanMap({ points }: { points: ScanPoint[] }) {
  const first = points[0];
  const region = first
    ? { latitude: first.lat, longitude: first.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 12, longitudeDelta: 12 };

  return (
    <MapView style={StyleSheet.absoluteFill} initialRegion={region} testID="scan-map">
      {points.map((p) => (
        <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.label} description={p.when}>
          <View style={[styles.pin, { backgroundColor: p.danger ? colors.red : colors.teal }]}>
            <Feather name="maximize" size={14} color="#fff" />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
});
