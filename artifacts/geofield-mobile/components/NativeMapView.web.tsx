import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  icon: string;
}

interface Props {
  initialRegion: any;
  markers: MarkerData[];
  onMarkerPress: (id: string) => void;
  onPress: () => void;
}

export default function NativeMapView({ markers }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <Feather name="map" size={56} color={colors.border} />
      <Text style={[styles.title, { color: colors.mutedForeground }]}>
        Map available on iOS & Android
      </Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {markers.length} located sample{markers.length !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  title: { fontSize: 15, textAlign: "center" },
  sub: { fontSize: 13 },
});
