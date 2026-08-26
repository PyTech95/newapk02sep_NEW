import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";

import { FamilyMember, SafeZone } from "@/src/api/types";
import { colors } from "@/src/theme";

interface Props {
  members: FamilyMember[];
  zones?: SafeZone[];
}

const DEFAULT_REGION = {
  latitude: 19.076,
  longitude: 72.8777,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export function FamilyMap({ members, zones = [] }: Props) {
  const located = members.filter((m) => m.latitude != null && m.longitude != null);
  const first = located[0];
  const region = first
    ? { latitude: first.latitude!, longitude: first.longitude!, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : DEFAULT_REGION;

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      showsUserLocation
      testID="family-map"
    >
      {zones.map((z) => (
        <Circle
          key={z.id}
          center={{ latitude: z.latitude, longitude: z.longitude }}
          radius={z.radius_m}
          strokeColor={colors.cyan}
          fillColor="rgba(34,211,238,0.12)"
        />
      ))}
      {members.map((m) =>
        m.trail && m.trail.length > 1 ? (
          <Polyline
            key={`trail-${m.member_id}`}
            coordinates={m.trail}
            strokeColor={m.is_me ? colors.cyan : colors.purple}
            strokeWidth={3}
            lineDashPattern={[1, 6]}
          />
        ) : null,
      )}
      {located.map((m) => (
        <Marker
          key={m.member_id}
          coordinate={{ latitude: m.latitude!, longitude: m.longitude! }}
          title={m.name}
          description={m.battery != null ? `Battery ${m.battery}%` : undefined}
        >
          <View style={[styles.pin, m.is_me && styles.pinMe]}>
            <Feather name={m.is_me ? "navigation" : "user"} size={16} color="#fff" />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinMe: { backgroundColor: colors.cyan },
});
