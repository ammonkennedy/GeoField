import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { type StratColumn, useData } from "@/contexts/DataContext";

const LITHOLOGY_COLORS: Record<string, string> = {
  Sandstone: "#e8d5a3",
  Limestone: "#b8d4e8",
  Shale: "#9aacb8",
  Mudstone: "#c0a87a",
  Conglomerate: "#d4b896",
  Coal: "#4a4a4a",
  Granite: "#d4c4c4",
  Basalt: "#6a6a7a",
  Chalk: "#f0f0e8",
  Dolomite: "#d0e8d0",
};

const LITHOLOGIES = Object.keys(LITHOLOGY_COLORS);

function ColumnPreview({ column, size = 40 }: { column: StratColumn; size?: number }) {
  const totalThickness = column.layers.reduce((s, l) => s + l.thickness, 0) || 1;
  return (
    <View style={{ width: 28, height: size, borderRadius: 4, overflow: "hidden", flexDirection: "column-reverse" }}>
      {column.layers.length === 0 ? (
        <View style={{ flex: 1, backgroundColor: "#e0e0e0" }} />
      ) : (
        column.layers.map((l) => (
          <View
            key={l.id}
            style={{
              height: (l.thickness / totalThickness) * size,
              backgroundColor: LITHOLOGY_COLORS[l.lithology] ?? "#ccc",
            }}
          />
        ))
      )}
    </View>
  );
}

function NewColumnModal({
  visible,
  onClose,
  onCreate,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, desc: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), desc.trim());
    setName("");
    setDesc("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 2 }]}
          onPress={() => {}}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            New Column
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Column name…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.modalInput, { backgroundColor: colors.muted, borderRadius: colors.radius, color: colors.foreground, borderColor: colors.border }]}
            autoFocus
          />
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="Description (optional)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.modalInput, { backgroundColor: colors.muted, borderRadius: colors.radius, color: colors.foreground, borderColor: colors.border }]}
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              style={[styles.modalBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Text style={[styles.modalBtnText, { color: "#fff" }]}>Create</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function StratTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { columns, addColumn, deleteColumn } = useData();
  const [modalVisible, setModalVisible] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleCreate = async (name: string, desc: string) => {
    const col = await addColumn(name, desc);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/strat/${col.id}`);
  };

  const handleDelete = (col: StratColumn) => {
    Alert.alert("Delete Column", `Delete "${col.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteColumn(col.id) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Strat Columns
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {columns.length} column{columns.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={[styles.fab, { backgroundColor: colors.primary, borderRadius: colors.radius * 2 }]}
        >
          <Feather name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={columns}
        keyExtractor={(item) => item.id}
        scrollEnabled={columns.length > 0}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 84 : insets.bottom + 80 }]}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bar-chart-2" size={52} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              No columns yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Tap + to build your first stratigraphic column
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.delay(index * 40).duration(300)}>
            <Pressable
              onPress={() => router.push(`/strat/${item.id}`)}
              onLongPress={() => handleDelete(item)}
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
              <ColumnPreview column={item} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.colName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {item.name}
                </Text>
                {item.description ? (
                  <Text style={[styles.colDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={[styles.colMeta, { color: colors.mutedForeground }]}>
                  {item.layers.length} layer{item.layers.length !== 1 ? "s" : ""}
                  {item.layers.length > 0
                    ? ` · ${item.layers.reduce((s, l) => s + l.thickness, 0).toFixed(1)} m total`
                    : ""}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => handleDelete(item)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                <Feather name="chevron-right" size={18} color={colors.border} />
              </View>
            </Pressable>
          </Animated.View>
        )}
      />

      <NewColumnModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreate={handleCreate}
        colors={colors}
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
  headerTitle: { fontSize: 24 },
  headerSub: { fontSize: 13, marginTop: 1 },
  fab: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  list: { padding: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  colName: { fontSize: 15, marginBottom: 2 },
  colDesc: { fontSize: 13, marginBottom: 3 },
  colMeta: { fontSize: 12 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  empty: { flex: 1, alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, marginTop: 12 },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { width: "100%", padding: 24, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  modalTitle: { fontSize: 18, marginBottom: 4 },
  modalInput: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderWidth: 1 },
  modalBtnText: { fontSize: 14, fontWeight: "600" },
});
