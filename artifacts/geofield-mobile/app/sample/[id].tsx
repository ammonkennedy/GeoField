import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { type GeoLocation, type Sample, type SampleType, useData } from "@/contexts/DataContext";

const SAMPLE_TYPES: { value: SampleType; label: string; icon: string; color: string }[] = [
  { value: "water", label: "Water", icon: "droplet", color: "#2E86B0" },
  { value: "rock", label: "Rock", icon: "hexagon", color: "#8A6040" },
  { value: "soil_sand", label: "Soil / Sand", icon: "circle", color: "#A08030" },
  { value: "air", label: "Air", icon: "wind", color: "#1F9D8A" },
  { value: "other", label: "Other", icon: "file-text", color: "#64748B" },
];

const WATER_FIELDS = [
  { key: "ph", label: "pH", placeholder: "0–14", keyboardType: "decimal-pad" as const },
  { key: "temperature", label: "Temperature (°C)", placeholder: "e.g. 18.5", keyboardType: "decimal-pad" as const },
  { key: "conductivity", label: "Conductivity (µS/cm)", placeholder: "e.g. 450", keyboardType: "decimal-pad" as const },
  { key: "dissolved_oxygen", label: "Dissolved O₂ (mg/L)", placeholder: "e.g. 8.2", keyboardType: "decimal-pad" as const },
  { key: "turbidity", label: "Turbidity (NTU)", placeholder: "e.g. 3.5", keyboardType: "decimal-pad" as const },
  { key: "salinity", label: "Salinity (ppt)", placeholder: "e.g. 0.5", keyboardType: "decimal-pad" as const },
];

const ROCK_FIELDS = [
  { key: "lithology", label: "Lithology", placeholder: "e.g. Sandstone, Limestone", keyboardType: "default" as const },
  { key: "grain_size", label: "Grain Size", placeholder: "e.g. Fine, Medium, Coarse", keyboardType: "default" as const },
  { key: "color", label: "Color", placeholder: "e.g. Grey, Buff, Brown", keyboardType: "default" as const },
  { key: "structure", label: "Structure", placeholder: "e.g. Massive, Bedded, Foliated", keyboardType: "default" as const },
  { key: "weathering", label: "Weathering", placeholder: "e.g. Fresh, Slight, Moderate", keyboardType: "default" as const },
  { key: "age", label: "Geologic Age", placeholder: "e.g. Jurassic, Cretaceous", keyboardType: "default" as const },
];

const SOIL_FIELDS = [
  { key: "texture", label: "Texture", placeholder: "e.g. Sandy loam, Clay", keyboardType: "default" as const },
  { key: "color", label: "Color (Munsell)", placeholder: "e.g. 10YR 4/2", keyboardType: "default" as const },
  { key: "organic_content", label: "Organic Content", placeholder: "e.g. Low, Medium, High", keyboardType: "default" as const },
  { key: "moisture", label: "Moisture", placeholder: "e.g. Dry, Moist, Wet", keyboardType: "default" as const },
  { key: "depth", label: "Depth (cm)", placeholder: "e.g. 0–20", keyboardType: "default" as const },
];

const AIR_FIELDS = [
  { key: "pidReading", label: "PID Reading", placeholder: "e.g. 2.450", keyboardType: "decimal-pad" as const },
  { key: "pidUnits", label: "PID Units", placeholder: "ppm, ppb, mg/m3", keyboardType: "default" as const },
  { key: "targetCompound", label: "Target Compound / VOC", placeholder: "e.g. Benzene, total VOCs", keyboardType: "default" as const },
  { key: "lampEnergy", label: "Lamp Energy", placeholder: "9.8, 10.6, or 11.7 eV", keyboardType: "default" as const },
  { key: "calibrationGas", label: "Calibration Gas", placeholder: "e.g. Isobutylene", keyboardType: "default" as const },
  { key: "alarmStatus", label: "Alarm Status", placeholder: "No Alarm, Low, High, STEL, TWA", keyboardType: "default" as const },
  { key: "samplingMode", label: "Sampling Mode", placeholder: "Grab, continuous, headspace", keyboardType: "default" as const },
  { key: "ambientTemperature", label: "Ambient Temp (°C)", placeholder: "e.g. 22.4", keyboardType: "decimal-pad" as const },
  { key: "relativeHumidity", label: "Relative Humidity (%)", placeholder: "e.g. 55", keyboardType: "decimal-pad" as const },
  { key: "odor", label: "Odor", placeholder: "None, solvent, petroleum", keyboardType: "default" as const },
];

function getFields(type: SampleType) {
  if (type === "water") return WATER_FIELDS;
  if (type === "rock") return ROCK_FIELDS;
  if (type === "air") return AIR_FIELDS;
  if (type === "other") return [];
  return SOIL_FIELDS;
}

function generateSampleId(type: SampleType) {
  const prefix = type === "water" ? "WS" : type === "rock" ? "RS" : type === "air" ? "AS" : type === "other" ? "OS" : "SS";
  const ts = Date.now().toString().slice(-4);
  return `${prefix}-${ts}`;
}

function isVideoUri(uri: string) {
  return /\.(mp4|mov|m4v|webm|3gp)(\?|#|$)/i.test(uri);
}

export default function SampleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const colors = useColors();
  const navigation = useNavigation();
  const { samples, addSample, updateSample, deleteSample } = useData();

  const existing = isNew ? null : samples.find((s) => s.id === id) ?? null;

  const [sampleId, setSampleId] = useState(existing?.sampleId ?? "");
  const [sampleType, setSampleType] = useState<SampleType>(existing?.sampleType ?? "rock");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [fields, setFields] = useState<Record<string, string>>(existing?.fields ?? {});
  const [location, setLocation] = useState<GeoLocation | null>(existing?.location ?? null);
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);

  // Generate sample ID on new
  useEffect(() => {
    if (isNew && !sampleId) {
      setSampleId(generateSampleId(sampleType));
    }
  }, []);

  useEffect(() => {
    if (isNew) {
      setSampleId(generateSampleId(sampleType));
      setFields({});
    }
  }, [sampleType]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isNew ? "New Sample" : existing?.sampleId ?? "Sample" });
  }, [isNew, existing?.sampleId]);

  const setField = (key: string, val: string) => {
    setFields((prev) => ({ ...prev, [key]: val }));
  };

  const getLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location required", "Allow location access to capture GPS coordinates.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        altitude: loc.coords.altitude,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not get location.");
    } finally {
      setGettingLocation(false);
    }
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo and video access to attach media.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.7,
      allowsMultipleSelection: false,
      videoMaxDuration: 10,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow camera access to record videos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 10,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleSave = async () => {
    if (!sampleId.trim()) {
      Alert.alert("Sample ID required", "Please enter a sample ID.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await addSample({ sampleId: sampleId.trim(), sampleType, notes, fields, location, photos, folderId: null });
      } else if (existing) {
        await updateSample(existing.id, { sampleId: sampleId.trim(), sampleType, notes, fields, location, photos });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Sample", `Delete "${sampleId}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (existing) await deleteSample(existing.id);
          router.back();
        },
      },
    ]);
  };

  const typeInfo = SAMPLE_TYPES.find((t) => t.value === sampleType)!;

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 40 : 60 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Sample ID + Type */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SAMPLE ID</Text>
        <TextInput
          value={sampleId}
          onChangeText={setSampleId}
          placeholder="e.g. RS-001"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.idInput, { color: colors.foreground, borderBottomColor: colors.border, fontFamily: "Inter_700Bold" }]}
          autoCapitalize="characters"
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>SAMPLE TYPE</Text>
        <View style={styles.typeRow}>
          {SAMPLE_TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setSampleType(t.value)}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: sampleType === t.value ? t.color + "22" : colors.muted,
                  borderColor: sampleType === t.value ? t.color : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Feather name={t.icon as any} size={16} color={sampleType === t.value ? t.color : colors.mutedForeground} />
              <Text style={[styles.typeBtnText, { color: sampleType === t.value ? t.color : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* GPS */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
        <View style={styles.cardHeader}>
          <Feather name="map-pin" size={16} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Location</Text>
        </View>
        {location ? (
          <View style={[styles.locRow, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.locCoords, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {location.lat.toFixed(6)}°, {location.lon.toFixed(6)}°
              </Text>
              {location.altitude != null && (
                <Text style={[styles.locAlt, { color: colors.mutedForeground }]}>
                  Altitude: {location.altitude.toFixed(1)} m
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setLocation(null)}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={getLocation}
            style={[styles.gpsBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", borderRadius: colors.radius }]}
          >
            <Feather name={gettingLocation ? "loader" : "crosshair"} size={16} color={colors.primary} />
            <Text style={[styles.gpsBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {gettingLocation ? "Getting GPS…" : "Capture GPS Location"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Type-specific fields */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
        <View style={styles.cardHeader}>
          <Feather name={typeInfo.icon as any} size={16} color={typeInfo.color} />
          <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {typeInfo.label} Parameters
          </Text>
        </View>
        {getFields(sampleType).map((f, i) => (
          <View key={f.key} style={[styles.fieldRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
            <TextInput
              value={fields[f.key] ?? ""}
              onChangeText={(v) => setField(f.key, v)}
              placeholder={f.placeholder}
              placeholderTextColor={colors.mutedForeground}
              keyboardType={f.keyboardType}
              style={[styles.fieldInput, { color: colors.foreground }]}
              textAlign="right"
            />
          </View>
        ))}
      </View>

      {/* Notes */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
        <View style={styles.cardHeader}>
          <Feather name="file-text" size={16} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Notes</Text>
        </View>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Field observations, rock description, water quality notes…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          style={[styles.notesInput, { color: colors.foreground, backgroundColor: colors.muted, borderRadius: colors.radius }]}
          textAlignVertical="top"
        />
      </View>

      {/* Photos */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
        <View style={styles.cardHeader}>
          <Feather name="camera" size={16} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Photos & Videos</Text>
        </View>
        <View style={styles.photosRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrap}>
              {isVideoUri(uri) ? (
                <View style={[styles.videoTile, { borderRadius: colors.radius, backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="video" size={22} color={colors.primary} />
                  <Text style={[styles.videoTileText, { color: colors.mutedForeground }]}>Video</Text>
                </View>
              ) : (
                <Image source={{ uri }} style={[styles.photo, { borderRadius: colors.radius }]} />
              )}
              <Pressable
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                style={styles.photoDelete}
              >
                <Feather name="x" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
          {photos.length < 5 && (
            <View style={styles.photoActions}>
              <TouchableOpacity
                onPress={takePhoto}
                style={[styles.photoAddBtn, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <Feather name="camera" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={recordVideo}
                style={[styles.photoAddBtn, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <Feather name="video" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickMedia}
                style={[styles.photoAddBtn, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <Feather name="image" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: saving ? 0.7 : 1 }]}
        >
          <Feather name="check" size={18} color="#fff" />
          <Text style={[styles.saveBtnText, { fontFamily: "Inter_700Bold" }]}>{isNew ? "Save Sample" : "Update Sample"}</Text>
        </TouchableOpacity>
        {!isNew && (
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.deleteBtn, { borderColor: colors.destructive + "44", borderRadius: colors.radius }]}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, gap: 12 },
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 14 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  idInput: { fontSize: 24, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderWidth: 1.5 },
  typeBtnText: { fontSize: 12 },
  locRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  locCoords: { fontSize: 14 },
  locAlt: { fontSize: 12, marginTop: 2 },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderWidth: 1 },
  gpsBtnText: { fontSize: 14 },
  fieldRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11 },
  fieldLabel: { flex: 1, fontSize: 14 },
  fieldInput: { fontSize: 14, minWidth: 120, textAlign: "right" },
  notesInput: { padding: 12, fontSize: 14, minHeight: 100 },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrap: { position: "relative" },
  photo: { width: 72, height: 72 },
  photoDelete: {
    position: "absolute", top: 2, right: 2,
    backgroundColor: "rgba(0,0,0,0.6)", width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  photoActions: { flexDirection: "row", gap: 8 },
  photoAddBtn: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  videoTile: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  videoTileText: { fontSize: 11, fontWeight: "600" },
  actions: { gap: 10, marginTop: 4 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  saveBtnText: { fontSize: 16, color: "#fff" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, borderWidth: 1 },
  deleteBtnText: { fontSize: 14, fontWeight: "600" },
});
