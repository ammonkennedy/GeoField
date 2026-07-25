import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useData } from "@/contexts/DataContext";

function Row({
  icon,
  label,
  sub,
  onPress,
  danger,
  colors,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  danger?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed && onPress ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.destructive + "18" : colors.muted, borderRadius: colors.radius }]}>
        <Feather name={icon as any} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? colors.destructive : colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {label}
        </Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {onPress && <Feather name="chevron-right" size={16} color={colors.border} />}
    </Pressable>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function FolderModal({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { folders, addFolder, deleteFolder } = useData();
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    addFolder(newName.trim());
    setNewName("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Datasets
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Add new */}
        <View style={[styles.addRow, { borderBottomColor: colors.border }]}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="New dataset name…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.addInput, { backgroundColor: colors.muted, borderRadius: colors.radius, color: colors.foreground }]}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <TouchableOpacity
            onPress={handleAdd}
            style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {folders.length === 0 && (
            <View style={styles.empty}>
              <Feather name="folder" size={36} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No datasets yet</Text>
            </View>
          )}
          {folders.map((f) => (
            <View key={f.id} style={[styles.folderRow, { borderBottomColor: colors.border }]}>
              <Feather name="folder" size={18} color={colors.accent} />
              <Text style={[styles.folderName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
                {f.name}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Delete Dataset", `Delete "${f.name}"? Samples will not be deleted.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteFolder(f.id) },
                  ])
                }
              >
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function MoreTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { samples, folders, measurements, columns } = useData();
  const [folderModal, setFolderModal] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 12,
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 90,
        gap: 16,
      }}
    >
      <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>More</Text>

      {/* Stats */}
      <View style={[styles.statsRow]}>
        {[
          { val: samples.length, label: "Samples", icon: "layers" },
          { val: folders.length, label: "Datasets", icon: "folder" },
          { val: measurements.length, label: "S&D", icon: "compass" },
          { val: columns.length, label: "Columns", icon: "bar-chart-2" },
        ].map((s) => (
          <View
            key={s.label}
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}
          >
            <Feather name={s.icon as any} size={18} color={colors.primary} />
            <Text style={[styles.statVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{s.val}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Data */}
      <Section title="DATA" colors={colors}>
        <Row icon="folder" label="Datasets" sub={`${folders.length} dataset${folders.length !== 1 ? "s" : ""}`} onPress={() => setFolderModal(true)} colors={colors} />
      </Section>

      {/* Sample type legend */}
      <Section title="SAMPLE TYPES" colors={colors}>
        {[
          { type: "Water", color: colors.water, icon: "droplet", desc: "pH, temperature, conductivity, DO, turbidity" },
          { type: "Rock", color: colors.rock, icon: "hexagon", desc: "Lithology, grain size, structure, weathering" },
          { type: "Soil / Sand", color: colors.soil, icon: "circle", desc: "Texture, color, organic content, moisture" },
          { type: "Other", color: colors.mutedForeground, icon: "file-text", desc: "Flexible material notes, purpose, and field context" },
        ].map((t) => (
          <View key={t.type} style={[styles.legendRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.legendDot, { backgroundColor: t.color + "33", borderRadius: colors.radius }]}>
              <Feather name={t.icon as any} size={16} color={t.color} />
            </View>
            <View>
              <Text style={[styles.legendLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{t.type}</Text>
              <Text style={[styles.legendDesc, { color: colors.mutedForeground }]}>{t.desc}</Text>
            </View>
          </View>
        ))}
      </Section>

      {/* About */}
      <Section title="ABOUT" colors={colors}>
        <Row icon="info" label="GeoField" sub="Geological field data collection" colors={colors} />
        <Row icon="smartphone" label="Version" sub="1.0.0" colors={colors} />
      </Section>

      <FolderModal visible={folderModal} onClose={() => setFolderModal(false)} colors={colors} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 28, marginBottom: 4 },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, alignItems: "center", padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  statVal: { fontSize: 20 },
  statLabel: { fontSize: 10 },
  section: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 1 },
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  legendDot: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  legendLabel: { fontSize: 14, marginBottom: 1 },
  legendDesc: { fontSize: 12 },
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 20 },
  addRow: {
    flexDirection: "row", gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  folderRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderName: { flex: 1, fontSize: 15 },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyText: { fontSize: 14 },
});
