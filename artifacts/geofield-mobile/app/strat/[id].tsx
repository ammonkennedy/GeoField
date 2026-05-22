import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useLayoutEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { type StratLayer, useData } from "@/contexts/DataContext";

function uid() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const LITHOLOGY_OPTS = [
  { name: "Sandstone", color: "#e8d5a3" },
  { name: "Limestone", color: "#b8d4e8" },
  { name: "Shale", color: "#9aacb8" },
  { name: "Mudstone", color: "#c0a87a" },
  { name: "Conglomerate", color: "#d4b896" },
  { name: "Coal", color: "#4a4a4a" },
  { name: "Granite", color: "#d4c4c4" },
  { name: "Basalt", color: "#6a6a7a" },
  { name: "Chalk", color: "#f0f0e8" },
  { name: "Dolomite", color: "#d0e8d0" },
  { name: "Siltstone", color: "#d0c090" },
  { name: "Chert", color: "#c8c0b0" },
];

function AddLayerModal({
  visible,
  onClose,
  onAdd,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (layer: StratLayer) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [lithology, setLithology] = useState("Sandstone");
  const [thickness, setThickness] = useState("1.0");
  const [age, setAge] = useState("");
  const [desc, setDesc] = useState("");

  const selected = LITHOLOGY_OPTS.find((l) => l.name === lithology);

  const handleAdd = () => {
    const t = parseFloat(thickness);
    if (isNaN(t) || t <= 0) {
      Alert.alert("Invalid thickness", "Enter a positive number in metres.");
      return;
    }
    onAdd({ id: uid(), lithology, color: selected?.color ?? "#ccc", thickness: t, age, description: desc });
    setThickness("1.0");
    setAge("");
    setDesc("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="formSheet">
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Add Layer
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Lithology picker */}
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>LITHOLOGY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
              {LITHOLOGY_OPTS.map((l) => (
                <Pressable
                  key={l.name}
                  onPress={() => setLithology(l.name)}
                  style={[
                    styles.lithChip,
                    {
                      backgroundColor: lithology === l.name ? l.color : colors.muted,
                      borderColor: lithology === l.name ? l.color : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Text style={[styles.lithChipText, { color: lithology === l.name ? "#333" : colors.mutedForeground }]}>
                    {l.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Thickness */}
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>THICKNESS (m)</Text>
            <TextInput
              value={thickness}
              onChangeText={setThickness}
              keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius, borderColor: colors.border }]}
            />
          </View>

          {/* Age */}
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>GEOLOGIC AGE</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              placeholder="e.g. Cretaceous, Jurassic"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius, borderColor: colors.border }]}
            />
          </View>

          {/* Description */}
          <View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="Notes about this layer…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.textarea, { backgroundColor: colors.muted, color: colors.foreground, borderRadius: colors.radius, borderColor: colors.border }]}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            onPress={handleAdd}
            style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={[styles.addBtnText, { fontFamily: "Inter_700Bold" }]}>Add Layer</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function StratBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const navigation = useNavigation();
  const { columns, updateColumn } = useData();
  const [modalOpen, setModalOpen] = useState(false);

  const column = columns.find((c) => c.id === id);

  useLayoutEffect(() => {
    navigation.setOptions({ title: column?.name ?? "Column Builder" });
  }, [column?.name]);

  if (!column) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Column not found</Text>
      </View>
    );
  }

  const totalThickness = column.layers.reduce((s, l) => s + l.thickness, 0);

  const addLayer = (layer: StratLayer) => {
    updateColumn(id, { layers: [layer, ...column.layers] });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const deleteLayer = (layerId: string) => {
    Alert.alert("Delete Layer", "Remove this layer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => updateColumn(id, { layers: column.layers.filter((l) => l.id !== layerId) }),
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Visual column preview */}
      {column.layers.length > 0 && (
        <View style={[styles.previewBar, { borderBottomColor: colors.border }]}>
          <View style={styles.previewColumn}>
            {[...column.layers].reverse().map((l) => (
              <View
                key={l.id}
                style={{
                  height: Math.max(6, (l.thickness / totalThickness) * 80),
                  backgroundColor: l.color,
                }}
              />
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewTotal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {totalThickness.toFixed(1)} m total
            </Text>
            <Text style={[styles.previewCount, { color: colors.mutedForeground }]}>
              {column.layers.length} layer{column.layers.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalOpen(true)}
            style={[styles.fab, { backgroundColor: colors.primary, borderRadius: colors.radius * 2 }]}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={column.layers}
        keyExtractor={(item) => item.id}
        scrollEnabled={column.layers.length > 0}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 40 : 60 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="layers" size={52} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              No layers yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Tap + to add your first layer from the top
            </Text>
            <TouchableOpacity
              onPress={() => setModalOpen(true)}
              style={[styles.emptyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}>Add First Layer</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.layerRow,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius * 1.5,
              },
            ]}
          >
            <View style={[styles.layerSwatch, { backgroundColor: item.color, borderRadius: 6 }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.layerTop}>
                <Text style={[styles.layerName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {item.lithology}
                </Text>
                <View style={[styles.thicknessBadge, { backgroundColor: colors.muted, borderRadius: 10 }]}>
                  <Text style={[styles.thicknessText, { color: colors.mutedForeground }]}>
                    {item.thickness.toFixed(1)} m
                  </Text>
                </View>
              </View>
              {item.age ? <Text style={[styles.layerSub, { color: colors.mutedForeground }]}>{item.age}</Text> : null}
              {item.description ? (
                <Text style={[styles.layerDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => deleteLayer(item.id)} style={{ padding: 6 }}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
        ListHeaderComponent={
          column.layers.length > 0 ? (
            <View style={styles.layerListHeader}>
              <Text style={[styles.layerListHeaderText, { color: colors.mutedForeground }]}>LAYERS (top → bottom)</Text>
              <TouchableOpacity
                onPress={() => setModalOpen(true)}
                style={[styles.fabSmall, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              >
                <Feather name="plus" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <AddLayerModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addLayer}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewColumn: { width: 32, height: 80, borderRadius: 4, overflow: "hidden", flexDirection: "column" },
  previewTotal: { fontSize: 18 },
  previewCount: { fontSize: 13, marginTop: 2 },
  fab: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  fabSmall: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10 },
  layerListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  layerListHeaderText: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  layerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  layerSwatch: { width: 28, height: 28, marginTop: 2 },
  layerTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  layerName: { fontSize: 15, flex: 1 },
  thicknessBadge: { paddingHorizontal: 8, paddingVertical: 2 },
  thicknessText: { fontSize: 11 },
  layerSub: { fontSize: 12, marginBottom: 2 },
  layerDesc: { fontSize: 13 },
  empty: { flex: 1, alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, marginTop: 12 },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32, marginBottom: 8 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontSize: 15 },
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 20 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 2 },
  lithChip: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5 },
  lithChipText: { fontSize: 13, fontWeight: "500" },
  input: { paddingHorizontal: 12, paddingVertical: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  textarea: { minHeight: 80 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 15 },
  addBtnText: { color: "#fff", fontSize: 16 },
});
