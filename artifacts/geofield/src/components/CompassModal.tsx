import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { AlertTriangle, CheckCircle, Pause, Smartphone, X } from "lucide-react";
import { Button } from "./ui/button";
import { angularDistance, bearingInMirroredTrueNorthFrame, calibratedLineation, calibratedStrike, deviceVectorToScreen, flipLineationDirection, horizontalPlaneAxesFromNormal, lineationOrientationFromVector, mirroredTrueNorthHeading, normalizeAzimuth, perpendicularScreenVector, planeOrientationFromNormal, projectEnuVectorToScreen, normalForDip, type LineationOrientation, type PlaneOrientation, type RotationMatrix3, type ScreenVector, type Vector3 } from "@/lib/strike-dip-math";

export type NorthReferencePreference = "true" | "magnetic";
type SensorReading = {
  normalEast: number; normalNorth: number; normalUp: number;
  lineEast?: number; lineNorth?: number; lineUp?: number;
  gravityX: number; gravityY: number; gravityZ: number;
  roll?: number; pitch?: number; yaw?: number;
  matrixM11?: number; matrixM12?: number; matrixM13?: number;
  matrixM21?: number; matrixM22?: number; matrixM23?: number;
  matrixM31?: number; matrixM32?: number; matrixM33?: number;
  interfaceOrientation?: string;
  quaternionX: number; quaternionY: number; quaternionZ: number; quaternionW: number;
  magneticHeading?: number; trueHeading?: number; headingAccuracy?: number;
  northReference: NorthReferencePreference;
  referenceFrame?: NorthReferencePreference;
};
type PlaneCapture = {
  measurementType: "plane";
  strikeDegrees: number; dipDegrees: number; dipDirectionDegrees: number;
  convention: "right-hand-rule"; northReference: "true" | "magnetic";
  compassAccuracy?: number; magneticHeading?: number; trueHeading?: number; magneticDeclination?: number;
  referenceFrame: "true" | "magnetic"; rawMagneticStrikeDegrees?: number;
  orientationQuaternion?: { x: number; y: number; z: number; w: number };
  planeNormal: Vector3; quality: "stable" | "unstable";
};
type LineationCapture = {
  measurementType: "lineation";
  trendDegrees: number; plungeDegrees: number;
  northReference: "true" | "magnetic"; referenceFrame: "true" | "magnetic";
  compassAccuracy?: number; lineVector: Vector3; quality: "stable" | "unstable";
};
type Capture = PlaneCapture | LineationCapture;
interface Props { open: boolean; onClose: () => void; onCapture: (capture: Capture) => void; }
interface GeologyMotionPlugin {
  available(): Promise<{ available: boolean }>;
  start(options: { northReference: NorthReferencePreference }): Promise<{ northReference: NorthReferencePreference }>;
  stop(): Promise<void>;
  addListener(eventName: "orientation", listener: (reading: SensorReading) => void): Promise<PluginListenerHandle>;
}
const GeologyMotion = registerPlugin<GeologyMotionPlugin>("GeologyMotion");
// At 30 Hz, four samples add about 50 ms of display smoothing delay.
// Keep roughly 0.8 seconds of history for measurement quality assessment.
const DISPLAY_WINDOW = 4;
const STABILITY_WINDOW = 24, AZIMUTH_TOLERANCE = 3, DIP_TOLERANCE = 2;
const NORTH_REFERENCE_KEY = "geofield_north_reference";
const emptyFiltered = () => ({ strike: null as number | null, dipDirection: null as number | null, dip: 0, strikeVector: null as Vector3 | null, downDipVector: null as Vector3 | null, screenStrikeVector: null as ScreenVector | null, screenDownDipVector: null as ScreenVector | null, screenNorthVector: null as ScreenVector | null });
const loadNorthReference = (): NorthReferencePreference =>
  localStorage.getItem(NORTH_REFERENCE_KEY) === "true" ? "true" : "magnetic";
const fmt = (value: number | null) => value === null ? "—" : `${normalizeAzimuth(Math.round(value)).toString().padStart(3, "0")}°`;
const signedAngle = (angle: number) => ((angle + 540) % 360) - 180;
const degrees = (radians: number) => radians * 180 / Math.PI;
const upwardUnitNormal = (normal: Vector3): Vector3 | null => {
  const length = Math.hypot(normal.east, normal.north, normal.up);
  if (!Number.isFinite(length) || length < 1e-9) return null;
  const sign = normal.up < 0 ? -1 : 1;
  return { east: sign * normal.east / length, north: sign * normal.north / length, up: sign * normal.up / length };
};

function PlaneCompass({ strikeVector, downDipVector, dip, held = false }: { strikeVector: ScreenVector | null; downDipVector: ScreenVector | null; dip: number; held?: boolean }) {
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5);
  const labels = Array.from({ length: 12 }, (_, index) => index * 30);
  const point = (vector: ScreenVector, radius: number) => ({ x: 150 + vector.right * radius, y: 150 - vector.up * radius });
  const strikeStart = strikeVector ? point(strikeVector, -102) : null;
  const strikeEnd = strikeVector ? point(strikeVector, 102) : null;
  const strikeLevelStart = strikeVector ? point(strikeVector, -88) : null;
  const strikeLevelEnd = strikeVector ? point(strikeVector, 88) : null;
  const downDipEnd = downDipVector ? point(downDipVector, 78) : null;
  const downDipArrowLeft = downDipVector ? {
    x: downDipEnd!.x - downDipVector.right * 12 - downDipVector.up * 7,
    y: downDipEnd!.y + downDipVector.up * 12 - downDipVector.right * 7,
  } : null;
  const downDipArrowRight = downDipVector ? {
    x: downDipEnd!.x - downDipVector.right * 12 + downDipVector.up * 7,
    y: downDipEnd!.y + downDipVector.up * 12 + downDipVector.right * 7,
  } : null;
  return <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[310px] drop-shadow-2xl" aria-label="Geological strike and dip instrument">
    <defs>
      <radialGradient id="geoFace" cx="42%" cy="35%"><stop offset="0" stopColor="#202a3a" /><stop offset="0.68" stopColor="#101722" /><stop offset="1" stopColor="#080d14" /></radialGradient>
      <filter id="geoGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <circle cx="150" cy="150" r="143" fill="#05080d" stroke="#64748b" strokeWidth="2" />
    <circle cx="150" cy="150" r="136" fill="url(#geoFace)" stroke="#293548" strokeWidth="2" />
    <circle cx="150" cy="150" r="108" fill="none" stroke="#334155" strokeWidth="1" />
    {ticks.map((degree) => { const angle = (degree - 90) * Math.PI / 180; const major = degree % 30 === 0; const medium = degree % 10 === 0; const outer = 132; const inner = major ? 116 : medium ? 120 : 125; return <line key={degree} x1={150 + outer * Math.cos(angle)} y1={150 + outer * Math.sin(angle)} x2={150 + inner * Math.cos(angle)} y2={150 + inner * Math.sin(angle)} stroke={major ? "#e2e8f0" : medium ? "#94a3b8" : "#526176"} strokeWidth={major ? 2 : 1} />; })}
    {labels.map((degree) => { const angle = (degree - 90) * Math.PI / 180; return <text key={degree} x={150 + 99 * Math.cos(angle)} y={150 + 99 * Math.sin(angle) + 4} textAnchor="middle" fill="#dbe4f0" fontFamily="ui-monospace, SFMono-Regular" fontSize="11" fontWeight="650">{degree}</text>; })}
    {strikeStart && strikeEnd && strikeLevelStart && strikeLevelEnd && strikeVector && <g filter="url(#geoGlow)">
      <line x1={strikeStart.x} y1={strikeStart.y} x2={strikeEnd.x} y2={strikeEnd.y} stroke={held ? "#1e3a8a" : "#60a5fa"} strokeWidth="6" strokeLinecap="round" />
      <line x1={strikeStart.x} y1={strikeStart.y} x2={strikeEnd.x} y2={strikeEnd.y} stroke={held ? "#1d4ed8" : "#dbeafe"} strokeWidth="1.5" />
      {[strikeLevelStart, strikeLevelEnd].map((center, index) => <line key={index} x1={center.x - strikeVector.up * 9} y1={center.y - strikeVector.right * 9} x2={center.x + strikeVector.up * 9} y2={center.y + strikeVector.right * 9} stroke={held ? "#1d4ed8" : "#93c5fd"} strokeWidth="3" strokeLinecap="round" />)}
    </g>}
    {downDipEnd && downDipArrowLeft && downDipArrowRight && <g><line x1="150" y1="150" x2={downDipEnd.x} y2={downDipEnd.y} stroke="#fbbf24" strokeWidth="3" strokeDasharray="5 4" /><path d={`M ${downDipEnd.x} ${downDipEnd.y} L ${downDipArrowLeft.x} ${downDipArrowLeft.y} L ${downDipArrowRight.x} ${downDipArrowRight.y} Z`} fill="#fbbf24" /></g>}
    <g transform={`rotate(${-Math.min(90, Math.max(0, dip))},150,150)`}><line x1="128" y1="181" x2="172" y2="181" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" /></g>
    <text x="150" y="205" textAnchor="middle" fill="#94a3b8" fontSize="8" letterSpacing="1.4">PLANE ATTITUDE</text>
  </svg>;
}

function NorthCompass({ northVector, reference }: { northVector: ScreenVector | null; reference: NorthReferencePreference }) {
  const vector = northVector ?? { right: 0, up: 1 };
  const tip = { x: 100 + vector.right * 66, y: 100 - vector.up * 66 };
  const tail = { x: 100 - vector.right * 42, y: 100 + vector.up * 42 };
  const left = { x: 100 - vector.up * 11, y: 100 - vector.right * 11 };
  const right = { x: 100 + vector.up * 11, y: 100 + vector.right * 11 };
  const ticks = Array.from({ length: 24 }, (_, index) => index * 15);
  return <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-xl" aria-label={`${reference === "true" ? "True" : "Magnetic"} north compass`}>
    <defs><radialGradient id="northFace" cx="40%" cy="35%"><stop offset="0" stopColor="#253247" /><stop offset="1" stopColor="#080d14" /></radialGradient></defs>
    <circle cx="100" cy="100" r="94" fill="#05080d" stroke="#64748b" strokeWidth="3" />
    <circle cx="100" cy="100" r="87" fill="url(#northFace)" stroke="#293548" strokeWidth="2" />
    {ticks.map((degree) => { const angle = (degree - 90) * Math.PI / 180; const major = degree % 90 === 0; return <line key={degree} x1={100 + 80 * Math.cos(angle)} y1={100 + 80 * Math.sin(angle)} x2={100 + (major ? 68 : 73) * Math.cos(angle)} y2={100 + (major ? 68 : 73) * Math.sin(angle)} stroke={major ? "#e2e8f0" : "#64748b"} strokeWidth={major ? 3 : 1.5} />; })}
    <path d={`M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`} fill="#ef4444" />
    <path d={`M ${tail.x} ${tail.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`} fill="#e2e8f0" />
    <circle cx="100" cy="100" r="8" fill="#0f172a" stroke="#f8fafc" strokeWidth="3" />
    <text x="100" y="35" textAnchor="middle" fill="#fca5a5" fontSize="16" fontWeight="800">N</text>
    <text x="100" y="177" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700" letterSpacing="1.2">{reference === "true" ? "TRUE NORTH" : "MAGNETIC NORTH"}</text>
  </svg>;
}

function LineationCompass({ towardTop, held }: { towardTop: boolean; held: boolean }) {
  return <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[310px] drop-shadow-2xl" aria-label="Lineation trend and plunge instrument">
    <defs><radialGradient id="lineFace" cx="42%" cy="35%"><stop offset="0" stopColor="#202a3a" /><stop offset="1" stopColor="#080d14" /></radialGradient></defs>
    <circle cx="150" cy="150" r="143" fill="#05080d" stroke="#64748b" strokeWidth="2" />
    <circle cx="150" cy="150" r="136" fill="url(#lineFace)" stroke="#293548" strokeWidth="2" />
    {Array.from({ length: 36 }, (_, index) => index * 10).map((degree) => { const angle = (degree - 90) * Math.PI / 180; return <line key={degree} x1={150 + 132 * Math.cos(angle)} y1={150 + 132 * Math.sin(angle)} x2={150 + (degree % 30 === 0 ? 116 : 124) * Math.cos(angle)} y2={150 + (degree % 30 === 0 ? 116 : 124) * Math.sin(angle)} stroke={degree % 30 === 0 ? "#e2e8f0" : "#526176"} strokeWidth={degree % 30 === 0 ? 2 : 1} />; })}
    <text x="150" y="35" textAnchor="middle" fill="#fca5a5" fontSize="14" fontWeight="800">TOP</text>
    <line x1="150" y1="258" x2="150" y2="42" stroke={held ? "#1e3a8a" : "#dbeafe"} strokeWidth="8" strokeLinecap="round" />
    <line x1="150" y1="258" x2="150" y2="42" stroke={held ? "#1d4ed8" : "#3b82f6"} strokeWidth="3" strokeLinecap="round" />
    <path d={towardTop ? "M150 48 L137 72 L163 72 Z" : "M150 252 L137 228 L163 228 Z"} fill="#fbbf24" stroke="#fff7cc" strokeWidth="2" />
    <text x="150" y="284" textAnchor="middle" fill="#94a3b8" fontSize="9" letterSpacing="1.4">PHONE LONGITUDINAL AXIS</text>
  </svg>;
}

export function CompassModal({ open, onClose, onCapture }: Props) {
  const [status, setStatus] = useState<"starting" | "active" | "unavailable" | "error">("starting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedNorthReference, setSelectedNorthReference] = useState<NorthReferencePreference>(loadNorthReference);
  const [activeNorthReference, setActiveNorthReference] = useState<NorthReferencePreference | null>(null);
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [rawOrientation, setRawOrientation] = useState({ strike: null as number | null, dipDirection: null as number | null, dip: 0 });
  const [filtered, setFiltered] = useState(emptyFiltered);
  const [stable, setStable] = useState(false);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const [primaryInstrument, setPrimaryInstrument] = useState<"strike-dip" | "north">("strike-dip");
  const [mode, setMode] = useState<"plane" | "lineation">("plane");
  const [lineation, setLineation] = useState<LineationOrientation | null>(null);
  const [lineStable, setLineStable] = useState(false);
  const [lineFlipped, setLineFlipped] = useState(false);
  const lineFlippedRef = useRef(false);
  const [lineArrowTowardTop, setLineArrowTowardTop] = useState(true);
  const [mockDip, setMockDip] = useState(30);
  const [mockDirection, setMockDirection] = useState(90);
  const history = useRef<Array<{ strike: number | null; dipDirection: number | null; dip: number; normal: Vector3; gravityX: number; gravityY: number }>>([]);
  const lineHistory = useRef<Vector3[]>([]);
  const native = Capacitor.isNativePlatform();

  const process = (raw: SensorReading) => {
    if (heldRef.current) return;
    if (raw.northReference !== "true" && raw.northReference !== "magnetic") {
      setError("The device supplied an unsupported north reference.");
      setStatus("error");
      return;
    }
    setActiveNorthReference(raw.northReference);
    const liveDeclination = typeof raw.trueHeading === "number" && typeof raw.magneticHeading === "number"
      ? signedAngle(raw.trueHeading - raw.magneticHeading)
      : null;
    const correctTrueOrientation = (orientation: PlaneOrientation): PlaneOrientation => {
      const referenced = raw.northReference === "true" && liveDeclination !== null
        ? {
            ...orientation,
            strike: orientation.strike === null ? null : bearingInMirroredTrueNorthFrame(orientation.strike, liveDeclination),
            dipDirection: orientation.dipDirection === null ? null : bearingInMirroredTrueNorthFrame(orientation.dipDirection, liveDeclination),
          }
        : orientation;
      return { ...referenced, strike: calibratedStrike(referenced.strike) };
    };
    const normal = { east: raw.normalEast, north: raw.normalNorth, up: raw.normalUp };
    const rawResult = correctTrueOrientation(planeOrientationFromNormal(normal));
    setRawOrientation(rawResult);
    const unitNormal = upwardUnitNormal(normal);
    if (!unitNormal) return;
    const result = correctTrueOrientation(planeOrientationFromNormal(normal));
    history.current = [...history.current.slice(-(STABILITY_WINDOW - 1)), {
      ...result,
      normal: unitNormal,
      gravityX: raw.gravityX,
      gravityY: raw.gravityY,
    }];
    const displayHistory = history.current.slice(-DISPLAY_WINDOW);
    const meanNormal = upwardUnitNormal(displayHistory.reduce((sum, item) => ({
      east: sum.east + item.normal.east,
      north: sum.north + item.normal.north,
      up: sum.up + item.normal.up,
    }), { east: 0, north: 0, up: 0 }));
    if (!meanNormal) return;
    const meanGravity = displayHistory.reduce((sum, item) => ({
      x: sum.x + item.gravityX,
      y: sum.y + item.gravityY,
    }), { x: 0, y: 0 });
    const meanOrientation = correctTrueOrientation(planeOrientationFromNormal(meanNormal));
    const axes = horizontalPlaneAxesFromNormal(meanNormal);
    const matrixKeys: Array<keyof SensorReading> = ["matrixM11", "matrixM12", "matrixM13", "matrixM21", "matrixM22", "matrixM23", "matrixM31", "matrixM32", "matrixM33"];
    const hasMatrix = matrixKeys.every((key) => typeof raw[key] === "number");
    const matrix = hasMatrix ? {
      m11: raw.matrixM11!, m12: raw.matrixM12!, m13: raw.matrixM13!,
      m21: raw.matrixM21!, m22: raw.matrixM22!, m23: raw.matrixM23!,
      m31: raw.matrixM31!, m32: raw.matrixM32!, m33: raw.matrixM33!,
    } satisfies RotationMatrix3 : null;
    const dipRadians = meanOrientation.dip * Math.PI / 180;
    const downSlope = axes ? {
      east: axes.downDip.east * Math.cos(dipRadians),
      north: axes.downDip.north * Math.cos(dipRadians),
      up: -Math.sin(dipRadians),
    } : null;
    const screenStrikeVector = axes
      ? matrix
        ? projectEnuVectorToScreen(axes.strike, matrix, raw.interfaceOrientation)
        : { right: axes.strike.east, up: axes.strike.north }
      : null;
    const projectedDownSlope = downSlope
      ? matrix
        ? projectEnuVectorToScreen(downSlope, matrix, raw.interfaceOrientation)
        : { right: axes!.downDip.east, up: axes!.downDip.north }
      : null;
    // Use the same sample window for gravity and the plane normal so the
    // ground-facing arrow and strike line cross their endpoint boundary together.
    const screenGravity = deviceVectorToScreen(meanGravity.x, meanGravity.y, raw.interfaceOrientation);
    const screenDownDipVector = perpendicularScreenVector(screenStrikeVector, screenGravity ?? projectedDownSlope);
    const heading = raw.northReference === "true" && liveDeclination !== null && typeof raw.trueHeading === "number"
      ? mirroredTrueNorthHeading(raw.trueHeading, liveDeclination)
      : raw.northReference === "true" ? raw.trueHeading : raw.magneticHeading;
    const headingRadians = typeof heading === "number" ? heading * Math.PI / 180 : null;
    const headingNorthVector = headingRadians === null ? null : { right: -Math.sin(headingRadians), up: Math.cos(headingRadians) };
    const projectedNorthVector = (matrix
      ? projectEnuVectorToScreen({ east: 0, north: 1, up: 0 }, matrix, raw.interfaceOrientation)
      : null);
    const screenNorthVector = (raw.northReference === "true" ? headingNorthVector : projectedNorthVector) ?? headingNorthVector ?? projectedNorthVector;
    const isStable = history.current.length >= STABILITY_WINDOW && history.current.every((item) => Math.abs(item.dip - meanOrientation.dip) <= DIP_TOLERANCE && (meanOrientation.dipDirection === null || item.dipDirection === null || angularDistance(item.dipDirection, meanOrientation.dipDirection) <= AZIMUTH_TOLERANCE));
    setReading({ ...raw, normalEast: normal.east, normalNorth: normal.north, normalUp: normal.up });
    setFiltered({ ...meanOrientation, strikeVector: axes?.strike ?? null, downDipVector: axes?.downDip ?? null, screenStrikeVector, screenDownDipVector, screenNorthVector });
    setStable(isStable); setStatus("active");
    if (typeof raw.lineEast === "number" && typeof raw.lineNorth === "number" && typeof raw.lineUp === "number") {
      const rawLine = { east: raw.lineEast, north: raw.lineNorth, up: raw.lineUp };
      lineHistory.current = [...lineHistory.current.slice(-(STABILITY_WINDOW - 1)), rawLine];
      const mean = lineHistory.current.slice(-DISPLAY_WINDOW).reduce((sum, item) => ({ east: sum.east + item.east, north: sum.north + item.north, up: sum.up + item.up }), { east: 0, north: 0, up: 0 });
      let result = lineationOrientationFromVector(mean);
      if (result && lineFlippedRef.current) result = flipLineationDirection(result);
      setLineation(result);
      setLineArrowTowardTop((rawLine.up <= 0) !== lineFlippedRef.current);
      setLineStable(Boolean(result && lineHistory.current.length >= STABILITY_WINDOW && lineHistory.current.every((item) => {
        let current = lineationOrientationFromVector(item);
        if (current && lineFlippedRef.current) current = flipLineationDirection(current);
        return current && angularDistance(current.trend, result!.trend) <= AZIMUTH_TOLERANCE && Math.abs(current.plunge - result!.plunge) <= DIP_TOLERANCE;
      })));
    }
  };

  useEffect(() => {
    if (!open) return;
    history.current = [];
    lineHistory.current = [];
    heldRef.current = false;
    setHeld(false);
    lineFlippedRef.current = false;
    setLineation(null); setLineStable(false); setLineFlipped(false);
    setStatus("starting"); setError(""); setStable(false); setReading(null);
    setRawOrientation({ strike: null, dipDirection: null, dip: 0 });
    setFiltered(emptyFiltered());
    setActiveNorthReference(null);
    let listener: PluginListenerHandle | undefined;
    let cancelled = false;
    if (!native) { setStatus("unavailable"); return; }
    void (async () => {
      try {
        if (!(await GeologyMotion.available()).available) throw new Error("Compass or full device motion is unavailable.");
        await GeologyMotion.stop();
        listener = await GeologyMotion.addListener("orientation", (raw) => { if (!cancelled) process(raw); });
        const started = await GeologyMotion.start({ northReference: selectedNorthReference });
        if (cancelled) return;
        setActiveNorthReference(started.northReference);
        if (selectedNorthReference === "true" && started.northReference === "magnetic") {
          setNotice("True north is unavailable. Using magnetic north.");
          localStorage.setItem(NORTH_REFERENCE_KEY, "magnetic");
          setSelectedNorthReference("magnetic");
        }
      } catch (cause: any) { setError(cause?.message || "Could not start geological compass."); setStatus("error"); }
    })();
    return () => {
      cancelled = true;
      void listener?.remove();
      void GeologyMotion.stop().catch(() => undefined);
    };
  }, [open, native, selectedNorthReference]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  const hasDeclination = typeof reading?.trueHeading === "number" && typeof reading?.magneticHeading === "number";
  const adjustedLineation = calibratedLineation(lineation);
  const northReference = activeNorthReference ?? selectedNorthReference;
  const declination = hasDeclination ? signedAngle(reading!.trueHeading! - reading!.magneticHeading!) : undefined;
  const accuracyLow = typeof reading?.headingAccuracy === "number" && reading.headingAccuracy > 20;
  const renderingAngle = filtered.screenStrikeVector ? normalizeAzimuth(degrees(Math.atan2(filtered.screenStrikeVector.right, filtered.screenStrikeVector.up))) : null;
  const diagnostic = useMemo(() => reading ? JSON.stringify({
    attitudeDegrees: {
      roll: typeof reading.roll === "number" ? degrees(reading.roll) : null,
      pitch: typeof reading.pitch === "number" ? degrees(reading.pitch) : null,
      yaw: typeof reading.yaw === "number" ? degrees(reading.yaw) : null,
    },
    surfaceNormalENU: { east: reading.normalEast, north: reading.normalNorth, up: reading.normalUp },
    horizontalStrikeVectorENU: filtered.strikeVector,
    projectedStrikeVectorScreen: filtered.screenStrikeVector,
    calculatedStrikeAzimuth: filtered.strike,
    screenRenderingAngle: renderingAngle,
    downDipVectorENU: filtered.downDipVector,
    referenceFrame: reading.referenceFrame,
    northReference,
    rawOrientation,
    declination,
    heading: { magnetic: reading.magneticHeading, true: reading.trueHeading, accuracy: reading.headingAccuracy },
    quaternion: [reading.quaternionX, reading.quaternionY, reading.quaternionZ, reading.quaternionW],
    gravity: [reading.gravityX, reading.gravityY, reading.gravityZ],
    screenOrientation: screen.orientation?.type,
  }, null, 2) : "No reading", [reading, rawOrientation, filtered, northReference, declination, renderingAngle]);
  if (!open) return null;

  const useMock = () => {
    const normal = normalForDip(mockDip, mockDirection);
    const plungeRadians = mockDip * Math.PI / 180;
    const trendRadians = mockDirection * Math.PI / 180;
    const mockLine = { east: Math.cos(plungeRadians) * Math.sin(trendRadians), north: Math.cos(plungeRadians) * Math.cos(trendRadians), up: -Math.sin(plungeRadians) };
    const mockReading = { normalEast: normal.east, normalNorth: normal.north, normalUp: normal.up, lineEast: mockLine.east, lineNorth: mockLine.north, lineUp: mockLine.up, gravityX: 0, gravityY: 0, gravityZ: -1, quaternionX: 0, quaternionY: 0, quaternionZ: 0, quaternionW: 1, magneticHeading: 0, headingAccuracy: 0, northReference: selectedNorthReference };
    process(mockReading);
    history.current = Array(STABILITY_WINDOW).fill({ ...planeOrientationFromNormal(normal), normal, gravityX: mockReading.gravityX, gravityY: mockReading.gravityY }); process(mockReading);
  };
  const canCapture = status === "active" && held && !!reading && (mode === "plane"
    ? filtered.strike !== null && filtered.dipDirection !== null
    : !!lineation);
  const capture = () => {
    if (!canCapture || !heldRef.current) return;
    if (mode === "lineation") {
      if (!adjustedLineation || !reading) return;
      onCapture({ measurementType: "lineation", trendDegrees: normalizeAzimuth(Math.round(adjustedLineation.trend)), plungeDegrees: Number(adjustedLineation.plunge.toFixed(1)), northReference, referenceFrame: northReference, compassAccuracy: reading.headingAccuracy, lineVector: adjustedLineation.vector, quality: lineStable ? "stable" : "unstable" });
      onClose();
      return;
    }
    if (filtered.strike === null || filtered.dipDirection === null || !reading) return;
    onCapture({ measurementType: "plane", strikeDegrees: Math.round(filtered.strike), dipDegrees: Number(filtered.dip.toFixed(1)), dipDirectionDegrees: Math.round(filtered.dipDirection), convention: "right-hand-rule", northReference, compassAccuracy: reading.headingAccuracy, magneticHeading: reading.magneticHeading, trueHeading: reading.trueHeading, magneticDeclination: declination, referenceFrame: northReference, rawMagneticStrikeDegrees: northReference === "magnetic" && rawOrientation.strike !== null ? Math.round(rawOrientation.strike) : undefined, orientationQuaternion: { x: reading.quaternionX, y: reading.quaternionY, z: reading.quaternionZ, w: reading.quaternionW }, planeNormal: { east: reading.normalEast, north: reading.normalNorth, up: reading.normalUp }, quality: stable ? "stable" : "unstable" }); onClose();
  };
  const selectNorthReference = (value: NorthReferencePreference) => {
    if (value === selectedNorthReference) return;
    localStorage.setItem(NORTH_REFERENCE_KEY, value);
    setNotice("");
    setSelectedNorthReference(value);
  };
  const toggleHeld = () => {
    if (status !== "active" || !reading) return;
    heldRef.current = !heldRef.current;
    setHeld(heldRef.current);
  };
  const flipLineDirection = () => {
    lineFlippedRef.current = !lineFlippedRef.current;
    setLineFlipped(lineFlippedRef.current);
    setLineation((current) => current ? flipLineationDirection(current) : current);
    setLineArrowTowardTop((current) => !current);
  };

  return createPortal(<div className="fixed inset-0 z-[200] flex h-[100dvh] min-h-0 items-stretch justify-center overflow-hidden bg-black/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Geological Compass">
    <div className="flex min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] text-slate-100 shadow-2xl sm:my-2 sm:max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
    <div className="z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1117] px-4 py-3">
      <div className="min-w-0"><h2 className="font-semibold">Geological Compass</h2><p className="text-xs text-slate-400">Right-hand-rule · {northReference} north</p></div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 border-white/60 bg-white text-slate-950 shadow-lg hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        aria-label="Back to strike and dip measurements"
        title="Back to strike and dip measurements"
      >
        <X className="h-7 w-7" strokeWidth={3} aria-hidden="true" />
      </button>
    </div>
    <div className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-y-contain px-5 pb-6 pt-4 [-webkit-overflow-scrolling:touch]">
      <div className="flex gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200"><Smartphone className="h-4 w-4 shrink-0" /><span>Place the <strong>back of the phone flat against the surface</strong> and hold steady. Tap the large compass face to hold the reading while you move the phone.</span></div>
      <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1" role="group" aria-label="North reference">
        {(["true", "magnetic"] as const).map((value) => <button key={value} type="button" aria-label={`Use ${value} north`} aria-pressed={selectedNorthReference === value} onClick={() => selectNorthReference(value)} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition ${selectedNorthReference === value ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}><span className="block">{value === "true" ? "True North" : "Magnetic North"}</span>{value === "magnetic" && <span className="mt-0.5 block text-[10px] font-normal">(preferred)</span>}</button>)}
      </div>
      <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1" role="group" aria-label="Measurement mode">
        <button type="button" aria-pressed={mode === "plane"} onClick={() => setMode("plane")} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "plane" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>Strike &amp; Dip</button>
        <button type="button" aria-pressed={mode === "lineation"} onClick={() => setMode("lineation")} className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "lineation" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>Lineation</button>
      </div>
      {notice && <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">{notice}</p>}
      {status === "error" && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
      {(status === "starting" || status === "active" || reading) && <>
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#121a27] to-[#080d14] px-3 pb-5 pt-5 shadow-inner">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 px-3 py-3 text-center shadow-lg"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-blue-200/70">{mode === "plane" ? "Strike · RHR" : "Azimuth · down-plunge"}</p><p className="font-mono text-2xl font-bold tabular-nums text-white">{mode === "plane" ? fmt(filtered.strike) : fmt(adjustedLineation?.trend ?? null)}</p></div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-center shadow-lg"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">{mode === "plane" ? "Dip" : "Plunge"}</p><p className="font-mono text-2xl font-bold tabular-nums text-white">{Math.round(mode === "plane" ? filtered.dip : lineation?.plunge ?? 0)}°</p><p className="text-[10px] text-amber-200/70">{mode === "plane" ? "plane slope" : "below horizontal"}</p></div>
          </div>
          <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-wider text-slate-400">Referenced to {northReference === "true" ? "True North" : "Magnetic North"}</p>
          <div className="relative mx-auto aspect-square w-full max-w-[330px]">
            {mode === "lineation"
              ? <LineationCompass towardTop={lineArrowTowardTop} held={held} />
              : primaryInstrument === "strike-dip"
              ? <PlaneCompass strikeVector={filtered.screenStrikeVector} downDipVector={filtered.screenDownDipVector} dip={filtered.dip} held={held} />
              : <NorthCompass northVector={filtered.screenNorthVector} reference={northReference} />}
            {mode === "plane" && <button type="button" onClick={() => setPrimaryInstrument((current) => current === "strike-dip" ? "north" : "strike-dip")} className="absolute right-1 top-1 z-20 h-24 w-24 overflow-hidden rounded-full border-2 border-white/30 bg-[#080d14] p-0.5 shadow-2xl transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={primaryInstrument === "strike-dip" ? `Open ${northReference} north compass` : "Open strike and dip compass"}>
              {primaryInstrument === "strike-dip"
                ? <NorthCompass northVector={filtered.screenNorthVector} reference={northReference} />
                : <PlaneCompass strikeVector={filtered.screenStrikeVector} downDipVector={filtered.screenDownDipVector} dip={filtered.dip} held={held} />}
            </button>}
            <button
              type="button"
              onClick={toggleHeld}
              disabled={status !== "active" || !reading}
              className="absolute inset-0 z-10 h-full w-full touch-manipulation select-none rounded-full border-0 bg-transparent p-0 shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-wait"
              aria-label={held ? "Resume live compass reading" : "Hold current compass reading"}
              aria-pressed={held}
              title={held ? "Resume live reading" : "Hold this reading"}
            />
          </div>
          {mode === "lineation" && <button type="button" onClick={flipLineDirection} className="mx-auto mt-2 block min-h-10 rounded-lg border border-white/15 bg-white/5 px-4 text-xs font-semibold text-slate-200 hover:bg-white/10">Flip Direction{lineFlipped ? " (flipped)" : ""}</button>}
          {mode === "plane"
            ? <div className="mt-1 flex items-center justify-center gap-4 text-[9px] uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-blue-400" />Horizontal strike line</span><span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t-2 border-dashed border-amber-400" />Dip angle</span></div>
            : <p className="mt-1 text-center text-[9px] uppercase tracking-wider text-slate-500">Align the blue center line with the linear feature; the arrow marks the measured direction</p>}
          {status === "starting" && <div className="absolute inset-0 flex items-center justify-center bg-[#080d14]/55 backdrop-blur-[1px]" aria-live="polite"><div className="flex items-center gap-3 rounded-full border border-white/15 bg-[#0d1117]/95 px-4 py-2.5 text-sm text-slate-200 shadow-xl"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" aria-hidden="true" />Starting sensors…</div></div>}
        </div>
        <div className={`flex items-center gap-2 rounded-xl p-3 text-sm ${held ? "bg-blue-500/10 text-blue-200" : (mode === "plane" ? stable : lineStable) ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>{held ? <Pause className="h-4 w-4" /> : (mode === "plane" ? stable : lineStable) ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{status === "starting" ? "Waiting for the first sensor reading" : held ? (canCapture ? "Reading paused — ready to capture. Tap the compass to resume." : "Reading paused — no valid measurement. Tap the compass to resume.") : (mode === "plane" ? stable : lineStable) ? "Stable — tap the compass to pause, then capture" : "Tap the compass to pause before capturing"}</div>
        {accuracyLow && <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-300">Compass accuracy is low. Move iPhone in a figure-eight and keep it away from magnets or metal objects.</p>}
        <Button className="w-full" disabled={!canCapture} onClick={capture}>Capture {mode === "plane" ? "Measurement" : "Lineation"}</Button>
      </>}
      {(!native || (import.meta.env.DEV && status === "error")) && <div className="space-y-3 rounded-xl border border-dashed border-slate-600 p-3"><p className="text-xs text-amber-300">Simulator/manual sensor mode — not a real measurement.</p><label className="block text-xs">Dip {mockDip}°<input className="w-full" type="range" min="0" max="90" value={mockDip} onChange={(e) => setMockDip(Number(e.target.value))} /></label><label className="block text-xs">Dip direction {mockDirection}°<input className="w-full" type="range" min="0" max="359" value={mockDirection} onChange={(e) => setMockDirection(Number(e.target.value))} /></label><Button variant="outline" className="w-full" onClick={useMock}>Apply Mock Reading</Button></div>}
      <details className="text-xs text-slate-400"><summary>Measurement diagnostics</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2">{diagnostic}</pre></details>
      <p className="text-center text-[10px] text-slate-500">Field aid only; not survey-grade. Horizontal planes below 1° have no defined strike or dip direction.</p>
    </div></div></div>, document.body);
}

export type { Capture as StrikeDipCapture };
