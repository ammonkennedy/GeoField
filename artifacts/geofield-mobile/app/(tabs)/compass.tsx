import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Circle, Defs, G, Line, Path, RadialGradient, Stop, Svg, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { type StrikeDipMeasurement, useData } from "@/contexts/DataContext";

const DEG = (r: number) => r * (180 / Math.PI);
const RAD = (d: number) => d * (Math.PI / 180);

function mod360(n: number) {
  return ((n % 360) + 360) % 360;
}

function bearing(deg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(mod360(deg) / 22.5) % 16];
}

// ── Compass SVG ──────────────────────────────────────────────────────────────
function CompassRose({ heading }: { heading: number | null }) {
  const cx = 110, cy = 110, r = 100;
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const deg = i * 5;
    const isCard = deg % 90 === 0;
    const isMaj = deg % 30 === 0;
    const len = isCard ? 18 : isMaj ? 12 : 7;
    const w = isCard ? 2 : isMaj ? 1.5 : 1;
    const rad = RAD(deg - 90);
    return {
      x1: cx + (r - 2) * Math.cos(rad),
      y1: cy + (r - 2) * Math.sin(rad),
      x2: cx + (r - 2 - len) * Math.cos(rad),
      y2: cy + (r - 2 - len) * Math.sin(rad),
      w,
      isCard,
    };
  });

  const labels = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const rad = RAD(deg - 90);
    const dist = r - 30;
    const names: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
    return { deg, x: cx + dist * Math.cos(rad), y: cy + dist * Math.sin(rad), isCard: deg % 90 === 0, name: names[deg] };
  });

  const nr = heading !== null ? -heading : 0;

  return (
    <Svg width={220} height={220} viewBox="0 0 220 220">
      <Defs>
        <RadialGradient id="bezel" cx="40%" cy="35%">
          <Stop offset="0%" stopColor="#2d3448" />
          <Stop offset="100%" stopColor="#0f1117" />
        </RadialGradient>
        <RadialGradient id="face" cx="40%" cy="35%">
          <Stop offset="0%" stopColor="#1e2435" />
          <Stop offset="100%" stopColor="#111520" />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r + 6} fill="url(#bezel)" />
      <Circle cx={cx} cy={cy} r={r} fill="url(#face)" />
      <Circle cx={cx} cy={cy} r={r - 22} fill="none" stroke="#2a3050" strokeWidth={0.5} />
      {ticks.map((t, i) => (
        <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={t.isCard ? "#7ba7e8" : "#3d4a6a"} strokeWidth={t.w} strokeLinecap="round" />
      ))}
      {labels.map(({ deg, x, y, isCard, name }) => (
        <SvgText key={deg} x={x} y={y} textAnchor="middle" dominantBaseline="central"
          fontSize={isCard ? 11 : 8} fontWeight={isCard ? "700" : "400"}
          fill={isCard ? "#a8c4f0" : "#5a6a90"}>
          {isCard ? name : deg}
        </SvgText>
      ))}
      <G transform={`rotate(${nr}, ${cx}, ${cy})`}>
        <Path d={`M ${cx} ${cy - 68} L ${cx - 7} ${cy + 4} L ${cx + 7} ${cy + 4} Z`} fill="#e84545" opacity={0.95} />
        <Path d={`M ${cx} ${cy + 68} L ${cx - 7} ${cy - 4} L ${cx + 7} ${cy - 4} Z`} fill="#4a5678" opacity={0.9} />
        <Path d={`M ${cx} ${cy - 68} L ${cx - 3} ${cy - 30} L ${cx} ${cy - 28} Z`} fill="#ff6b6b" opacity={0.5} />
      </G>
      <Circle cx={cx} cy={cy} r={7} fill="#1a1f2e" />
      <Circle cx={cx} cy={cy} r={4.5} fill="#7ba7e8" />
      <Circle cx={cx} cy={cy} r={2} fill="#c8dbf8" />
      <SvgText x={cx} y={cy + 85} textAnchor="middle" fontSize={13} fontWeight="700" fill="#a8c4f0" letterSpacing={1}>
        {heading !== null ? `${Math.round(mod360(heading)).toString().padStart(3, "0")}°` : "---°"}
      </SvgText>
    </Svg>
  );
}

// ── Dip arc ──────────────────────────────────────────────────────────────────
function DipMeter({ dip }: { dip: number }) {
  const cx = 80, cy = 68, r = 52;
  const color = dip > 60 ? "#e84545" : dip > 30 ? "#f59e0b" : "#22c55e";
  const needleAngle = 180 - dip;
  const needleRad = RAD(needleAngle);
  const needleX = cx + r * Math.cos(needleRad);
  const needleY = cy + r * Math.sin(needleRad);
  const arcPath = dip > 0
    ? `M ${cx - r} ${cy} A ${r} ${r} 0 ${dip > 90 ? 1 : 0} 1 ${needleX} ${needleY}`
    : "";

  return (
    <Svg width={160} height={80} viewBox="0 0 160 80">
      <Path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#2a3050" strokeWidth={8} strokeLinecap="round" />
      {dip > 0 && (
        <Path d={arcPath} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
      )}
      {[30, 60].map((d) => {
        const a = RAD(180 - d);
        return (
          <Line key={d}
            x1={cx + (r - 4) * Math.cos(a)} y1={cy + (r - 4) * Math.sin(a)}
            x2={cx + (r + 4) * Math.cos(a)} y2={cy + (r + 4) * Math.sin(a)}
            stroke="#3d4a6a" strokeWidth={1.5} />
        );
      })}
      <Line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={3} fill="#1a1f2e" stroke={color} strokeWidth={1.5} />
      <SvgText x={cx - r - 4} y={cy + 14} textAnchor="middle" fontSize={9} fill="#5a6a90" fontFamily="monospace">0°</SvgText>
      <SvgText x={cx + r + 4} y={cy + 14} textAnchor="middle" fontSize={9} fill="#5a6a90" fontFamily="monospace">90°</SvgText>
    </Svg>
  );
}

// ── Sensor hook ───────────────────────────────────────────────────────────────
function useDeviceSensors() {
  const [heading, setHeading] = useState<number | null>(null);
  const [dip, setDip] = useState(0);
  const headingRef = useRef<number>(0);
  const dipRef = useRef<number>(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      const handler = (e: any) => {
        if (e.alpha !== null) {
          const h = mod360(e.alpha);
          headingRef.current = h;
          setHeading(h);
        }
        if (e.beta !== null && e.gamma !== null) {
          const bRad = RAD(e.beta ?? 0);
          const gRad = RAD(e.gamma ?? 0);
          const d = Math.round(DEG(Math.acos(Math.min(1, Math.abs(Math.cos(bRad) * Math.cos(gRad))))));
          dipRef.current = d;
          setDip(d);
        }
      };
      window.addEventListener("deviceorientation", handler, true);
      return () => window.removeEventListener("deviceorientation", handler, true);
    }

    // Native — use expo-sensors
    let magSub: any, accSub: any;
    try {
      const { Magnetometer, Accelerometer } = require("expo-sensors");
      Magnetometer.setUpdateInterval(150);
      Accelerometer.setUpdateInterval(150);
      magSub = Magnetometer.addListener(({ x, y }: { x: number; y: number }) => {
        let angle = Math.atan2(-y, x) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        headingRef.current = angle;
        setHeading(angle);
      });
      accSub = Accelerometer.addListener(({ z }: { z: number }) => {
        const d = Math.round(DEG(Math.acos(Math.min(1, Math.abs(z)))));
        dipRef.current = d;
        setDip(d);
      });
    } catch {
      // expo-sensors not available
    }
    return () => {
      magSub?.remove();
      accSub?.remove();
    };
  }, []);

  return { heading, dip, headingRef, dipRef };
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CompassTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { measurements, addMeasurement, deleteMeasurement } = useData();
  const { heading, dip, headingRef, dipRef } = useDeviceSensors();
  const [locked, setLocked] = useState(false);
  const [lockedStrike, setLockedStrike] = useState(0);
  const [lockedDip, setLockedDip] = useState(0);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleLock = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLockedStrike(Math.round(mod360(headingRef.current)));
    setLockedDip(dipRef.current);
    setLocked(true);
  }, [headingRef, dipRef]);

  const handleSave = useCallback(() => {
    const strike = `${lockedStrike.toString().padStart(3, "0")}°`;
    const dipStr = `${lockedDip}°`;
    const dipDir = `${mod360(lockedStrike + 90).toString().padStart(3, "0")}°`;
    addMeasurement({
      label: `M-${Date.now().toString().slice(-4)}`,
      strike,
      dip: dipStr,
      dipDir,
      featureType: "Bedding",
      location: "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setLocked(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [lockedStrike, lockedDip, addMeasurement]);

  const handleDeleteMeasurement = (id: string) => {
    Alert.alert("Delete Measurement", "Remove this measurement?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMeasurement(id) },
    ]);
  };

  const strike = heading !== null ? mod360(heading) : 0;
  const dipDirection = heading !== null ? mod360(heading + 90) : 0;

  const renderMeasurement = ({ item, index }: { item: StrikeDipMeasurement; index: number }) => (
    <View style={[styles.mRow, { borderBottomColor: colors.border }]}>
      <View
        style={[styles.mNum, { backgroundColor: colors.primary + "22", borderRadius: colors.radius }]}
      >
        <Text style={[styles.mNumText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
          {measurements.length - index}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.mLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {item.label}
        </Text>
        <Text style={[styles.mDetail, { color: colors.mutedForeground }]}>
          Strike {item.strike} · Dip {item.dip} · {item.featureType}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDeleteMeasurement(item.id)} style={styles.mDelete}>
        <Feather name="trash-2" size={15} color={colors.destructive} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: "#0d1117" }]}>
      <FlatList
        data={measurements}
        keyExtractor={(item) => item.id}
        scrollEnabled={measurements.length > 0}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : insets.bottom + 80 }}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={[styles.header, { paddingTop: topPad + 12 }]}>
              <Text style={[styles.headerTitle, { fontFamily: "Inter_700Bold" }]}>Strike & Dip</Text>
              <Text style={styles.headerSub}>
                {measurements.length} measurement{measurements.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {/* Instruction */}
            <View style={styles.tip}>
              <Feather name="smartphone" size={13} color="#93c5fd" />
              <Text style={styles.tipText}>
                Place phone face-up flat on the rock, top edge along strike, then tap Lock
              </Text>
            </View>

            {/* Compass */}
            <View style={styles.compassWrap}>
              <CompassRose heading={heading} />
            </View>

            {/* Dip + Strike readouts */}
            <View style={styles.readouts}>
              <View style={styles.readoutBox}>
                <Text style={styles.readoutLabel}>DIP</Text>
                <DipMeter dip={dip} />
                <Text style={styles.readoutBig}>{dip}°</Text>
                {heading !== null && (
                  <Text style={styles.readoutSmall}>dir. {bearing(dipDirection)}</Text>
                )}
              </View>
              <View style={[styles.readoutBox, styles.readoutBoxRight]}>
                <Text style={styles.readoutLabel}>STRIKE</Text>
                <Text style={styles.readoutHuge}>
                  {heading !== null ? `${Math.round(strike).toString().padStart(3, "0")}°` : "--°"}
                </Text>
                {heading !== null && (
                  <Text style={styles.readoutSmall}>{bearing(strike)}</Text>
                )}
              </View>
            </View>

            {/* Lock / Save / Re-measure */}
            {locked ? (
              <View style={styles.lockedRow}>
                <View style={styles.lockedBadge}>
                  <Feather name="check-circle" size={14} color="#34d399" />
                  <Text style={styles.lockedText}>
                    Locked: {lockedStrike.toString().padStart(3, "0")}° · {lockedDip}°
                  </Text>
                </View>
                <View style={styles.btnRow}>
                  <Pressable
                    onPress={() => setLocked(false)}
                    style={[styles.btn, styles.btnOutline]}
                  >
                    <Text style={[styles.btnText, { color: "#a8c4f0" }]}>Re-measure</Text>
                  </Pressable>
                  <Pressable onPress={handleSave} style={[styles.btn, styles.btnGreen]}>
                    <Text style={[styles.btnText, { color: "#fff" }]}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={handleLock}
                  disabled={heading === null}
                  style={[styles.btn, styles.btnBlue, { opacity: heading === null ? 0.4 : 1 }]}
                >
                  <Feather name="lock" size={15} color="#fff" />
                  <Text style={[styles.btnText, { color: "#fff" }]}>Lock Measurement</Text>
                </Pressable>
              </View>
            )}

            {/* Measurements header */}
            {measurements.length > 0 && (
              <View style={[styles.mHeader, { borderTopColor: "#ffffff15" }]}>
                <Text style={styles.mHeaderText}>Saved Measurements</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="compass" size={36} color="#3d4a6a" />
            <Text style={styles.emptyText}>No measurements saved yet</Text>
          </View>
        }
        renderItem={renderMeasurement}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  headerTitle: { fontSize: 22, color: "#e2e8f4" },
  headerSub: { fontSize: 13, color: "#5a6a90", marginTop: 2 },
  tip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#172554",
    borderRadius: 10,
    padding: 10,
  },
  tipText: { flex: 1, fontSize: 12, color: "#93c5fd" },
  compassWrap: { alignItems: "center", marginTop: 16 },
  readouts: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, gap: 12 },
  readoutBox: { flex: 1, alignItems: "center", gap: 2, padding: 12, backgroundColor: "#1a1f2e", borderRadius: 14 },
  readoutBoxRight: { justifyContent: "center" },
  readoutLabel: { fontSize: 10, color: "#5a6a90", letterSpacing: 2, fontWeight: "700" },
  readoutBig: { fontSize: 26, fontWeight: "700", color: "#e2e8f4", marginTop: 2 },
  readoutHuge: { fontSize: 42, fontWeight: "700", color: "#e2e8f4", fontVariant: ["tabular-nums"] as any },
  readoutSmall: { fontSize: 12, color: "#5a6a90" },
  btnRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 14, gap: 10 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  btnBlue: { backgroundColor: "#2563eb" },
  btnGreen: { backgroundColor: "#059669" },
  btnOutline: { borderWidth: 1, borderColor: "#2a3050" },
  btnText: { fontSize: 14, fontWeight: "600" },
  lockedRow: { marginHorizontal: 16, marginTop: 12, gap: 8 },
  lockedBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#064e3b", borderRadius: 10, padding: 10,
  },
  lockedText: { color: "#34d399", fontSize: 13 },
  mHeader: {
    marginTop: 24,
    marginHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    marginBottom: 4,
  },
  mHeaderText: { fontSize: 12, color: "#5a6a90", letterSpacing: 1.5, fontWeight: "700" },
  mRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mNum: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  mNumText: { fontSize: 13 },
  mLabel: { fontSize: 14 },
  mDetail: { fontSize: 12, marginTop: 1 },
  mDelete: { padding: 6 },
  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyText: { fontSize: 14, color: "#3d4a6a" },
});
