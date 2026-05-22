import { Feather } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { type Sample, type SampleType, useData } from "@/contexts/DataContext";
import NativeMapView, { type MarkerData } from "@/components/NativeMapView";

function typeColor(type: SampleType, colors: ReturnType<typeof useColors>) {
  if (type === "water") return colors.water;
  if (type === "rock") return colors.rock;
  return colors.soil;
}

function typeLabel(type: SampleType) {
  if (type === "soil_sand") return "Soil";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function MapTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { samples } = useData();
  const [selected, setSelected] = useState<Sample | null>(null);
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  const located = samples.filter((s) => s.location);

  const initialRegion =
    located.length > 0
      ? {
          latitude:
            located.reduce((s, m) => s + (m.location?.lat ?? 0), 0) /
            located.length,
          longitude:
            located.reduce((s, m) => s + (m.location?.lon ?? 0), 0) /
            located.length,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }
      : {
          latitude: 37.7749,
          longitude: -122.4194,
          latitudeDelta: 10,
          longitudeDelta: 10,
        };

  const markers: MarkerData[] = located.map((s) => ({
    id: s.id,
    latitude: s.location!.lat,
    longitude: s.location!.lon,
    color: typeColor(s.sampleType, colors),
    icon:
      s.sampleType === "water"
        ? "droplet"
        : s.sampleType === "rock"
        ? "hexagon"
        : "circle",
  }));

  const showInfo = (id: string) => {
    const sample = samples.find((s) => s.id === id) ?? null;
    setSelected(sample);
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const hideInfo = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelected(null));
  };

  const cardTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [200, 0],
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <NativeMapView
        initialRegion={initialRegion}
        markers={markers}
        onMarkerPress={showInfo}
        onPress={hideInfo}
      />

      {/* Header overlay */}
      <View
        style={[
          styles.headerOverlay,
          {
            paddingTop: topPad + 8,
            backgroundColor: colors.background + "EE",
          },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: "Inter_700Bold" },
          ]}
        >
          Sample Map
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {located.length} located
        </Text>
      </View>

      {/* Legend */}
      <View
        style={[
          styles.legend,
          {
            bottom:
              Platform.OS === "web" ? 100 : insets.bottom + 90,
            backgroundColor: colors.background + "EE",
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        {(["water", "rock", "soil_sand"] as SampleType[]).map((t) => (
          <View key={t} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: typeColor(t, colors) },
              ]}
            />
            <Text
              style={[styles.legendText, { color: colors.mutedForeground }]}
            >
              {typeLabel(t)}
            </Text>
          </View>
        ))}
      </View>

      {/* Sample info card */}
      {selected && (
        <Animated.View
          style={[
            styles.infoCard,
            {
              bottom:
                Platform.OS === "web" ? 100 : insets.bottom + 90,
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius * 2,
              transform: [{ translateY: cardTranslate }],
            },
          ]}
        >
          <View style={styles.infoRow}>
            <View
              style={[
                styles.infoTypeDot,
                { backgroundColor: typeColor(selected.sampleType, colors) },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.infoId,
                  {
                    color: colors.foreground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {selected.sampleId}
              </Text>
              {selected.notes ? (
                <Text
                  style={[
                    styles.infoNotes,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={2}
                >
                  {selected.notes}
                </Text>
              ) : null}
              {selected.location && (
                <Text
                  style={[styles.infoCoords, { color: colors.mutedForeground }]}
                >
                  {selected.location.lat.toFixed(5)}°,{" "}
                  {selected.location.lon.toFixed(5)}°
                </Text>
              )}
            </View>
            <Pressable onPress={hideInfo} style={styles.infoClose}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Empty state overlay */}
      {located.length === 0 && (
        <View
          style={[
            styles.emptyOverlay,
            {
              backgroundColor: colors.background + "CC",
              bottom:
                Platform.OS === "web" ? 100 : insets.bottom + 90,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="map-pin" size={26} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No located samples yet.{"\n"}Add GPS to samples to see them here.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 20 },
  headerSub: { fontSize: 13 },
  legend: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  infoCard: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoTypeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  infoId: { fontSize: 16 },
  infoNotes: { fontSize: 13, marginTop: 2 },
  infoCoords: { fontSize: 11, marginTop: 4 },
  infoClose: { padding: 4 },
  emptyOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 13, textAlign: "center" },
});
