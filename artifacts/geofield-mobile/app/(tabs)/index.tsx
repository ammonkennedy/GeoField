import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { type Sample, type SampleType, useData } from "@/contexts/DataContext";

function typeColor(type: SampleType, colors: ReturnType<typeof useColors>) {
  if (type === "water") return colors.water;
  if (type === "rock") return colors.rock;
  if (type === "other") return colors.mutedForeground;
  return colors.soil;
}

function typeLabel(type: SampleType) {
  if (type === "soil_sand") return "Soil";
  if (type === "other") return "Other";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function SampleCard({
  item,
  index,
  colors,
  onDelete,
}: {
  item: Sample;
  index: number;
  colors: ReturnType<typeof useColors>;
  onDelete: () => void;
}) {
  const tc = typeColor(item.sampleType, colors);

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Sample", `Delete "${item.sampleId}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 25).duration(280)}>
      <Pressable
        onPress={() => router.push(`/sample/${item.id}`)}
        onLongPress={handleLongPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius * 1.5,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={[styles.typeStripe, { backgroundColor: tc, borderRadius: colors.radius }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={[styles.sampleId, { color: colors.foreground }]}>{item.sampleId}</Text>
            <View style={[styles.badge, { backgroundColor: tc + "25", borderRadius: 20 }]}>
              <Text style={[styles.badgeText, { color: tc }]}>{typeLabel(item.sampleType)}</Text>
            </View>
          </View>
          {item.notes ? (
            <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.notes}
            </Text>
          ) : null}
          <View style={styles.cardMeta}>
            {item.location ? (
              <View style={styles.metaRow}>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  {item.location.lat.toFixed(4)}°, {item.location.lon.toFixed(4)}°
                </Text>
              </View>
            ) : null}
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.border} style={{ alignSelf: "center", marginRight: 12 }} />
      </Pressable>
    </Animated.View>
  );
}

function Chip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.muted,
          borderRadius: 20,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

export default function SamplesTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { samples, folders, deleteSample } = useData();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = samples.filter((s) => {
    if (selectedFolder && s.folderId !== selectedFolder) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.sampleId.toLowerCase().includes(q) || s.notes?.toLowerCase().includes(q);
    }
    return true;
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            GeoField
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {samples.length} sample{samples.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/sample/new");
          }}
          style={[styles.fab, { backgroundColor: colors.primary, borderRadius: colors.radius * 2 }]}
        >
          <Feather name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search samples…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Folder chips */}
      {folders.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="All" active={!selectedFolder} onPress={() => setSelectedFolder(null)} colors={colors} />
          {folders.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              active={selectedFolder === f.id}
              onPress={() => setSelectedFolder(selectedFolder === f.id ? null : f.id)}
              colors={colors}
            />
          ))}
        </ScrollView>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        scrollEnabled={filtered.length > 0}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === "web" ? 100 : 110 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="layers" size={52} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              No samples yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Tap + to log your first field sample
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SampleCard
            item={item}
            index={index}
            colors={colors}
            onDelete={() => deleteSample(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 26, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 1 },
  fab: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  typeStripe: { width: 4, marginVertical: 0 },
  cardBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  sampleId: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  notes: { fontSize: 13, marginBottom: 6 },
  cardMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 11 },
  empty: { flex: 1, alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, marginTop: 12 },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
