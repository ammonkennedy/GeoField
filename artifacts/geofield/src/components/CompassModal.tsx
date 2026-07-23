import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { AlertTriangle, CheckCircle, Smartphone, X } from "lucide-react";
import { Button } from "./ui/button";
import { angularDistance, cardinalDirection, circularMean, normalizeAzimuth, planeOrientationFromNormal, rotateMagneticNormalToTrue, normalForDip, type Vector3 } from "@/lib/strike-dip-math";

type SensorReading = {
  normalEast: number; normalNorth: number; normalUp: number;
  gravityX: number; gravityY: number; gravityZ: number;
  quaternionX: number; quaternionY: number; quaternionZ: number; quaternionW: number;
  magneticHeading?: number; trueHeading?: number; headingAccuracy?: number; referenceFrame: string;
};
type Capture = {
  strikeDegrees: number; dipDegrees: number; dipDirectionDegrees: number;
  convention: "right-hand-rule"; northReference: "true" | "magnetic";
  compassAccuracy?: number; orientationQuaternion?: { x: number; y: number; z: number; w: number };
  planeNormal: Vector3; quality: "stable" | "unstable";
};
interface Props { open: boolean; onClose: () => void; onCapture: (capture: Capture) => void; }
interface GeologyMotionPlugin {
  available(): Promise<{ available: boolean }>;
  start(): Promise<void>; stop(): Promise<void>;
  addListener(eventName: "orientation", listener: (reading: SensorReading) => void): Promise<PluginListenerHandle>;
}
const GeologyMotion = registerPlugin<GeologyMotionPlugin>("GeologyMotion");
const STABILITY_WINDOW = 12, AZIMUTH_TOLERANCE = 3, DIP_TOLERANCE = 2;
const fmt = (value: number | null) => value === null ? "—" : `${Math.round(normalizeAzimuth(value)).toString().padStart(3, "0")}°`;

function PlaneCompass({ strike, dipDirection, dip }: { strike: number | null; dipDirection: number | null; dip: number }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return <div className="grid grid-cols-[220px_1fr] items-center gap-3">
    <svg viewBox="0 0 220 220" className="h-[220px] w-[220px]">
      <circle cx="110" cy="110" r="104" fill="#111827" stroke="#475569" strokeWidth="2" />
      {ticks.map((degree) => { const a = (degree - 90) * Math.PI / 180; const major = degree % 90 === 0; return <line key={degree} x1={110 + 98 * Math.cos(a)} y1={110 + 98 * Math.sin(a)} x2={110 + (major ? 82 : 89) * Math.cos(a)} y2={110 + (major ? 82 : 89) * Math.sin(a)} stroke={major ? "#e2e8f0" : "#64748b"} strokeWidth={major ? 2 : 1} />; })}
      {[["N",110,24],["E",196,114],["S",110,202],["W",24,114]].map(([label,x,y]) => <text key={String(label)} x={Number(x)} y={Number(y)} textAnchor="middle" fill={label === "N" ? "#f87171" : "#cbd5e1"} fontWeight="700">{label}</text>)}
      {strike !== null && <g transform={`rotate(${strike},110,110)`}><line x1="110" y1="34" x2="110" y2="186" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" /><circle cx="110" cy="110" r="7" fill="#dbeafe" /></g>}
      {dipDirection !== null && <g transform={`rotate(${dipDirection},110,110)`}><line x1="110" y1="110" x2="110" y2="46" stroke="#34d399" strokeWidth="4" /><path d="M110 36 L102 51 L118 51 Z" fill="#34d399" /></g>}
    </svg>
    <svg viewBox="0 0 100 150" className="h-36 w-24">
      <line x1="12" y1="126" x2="88" y2="126" stroke="#64748b" strokeWidth="2" />
      <g transform={`rotate(${-Math.min(90, Math.max(0, dip))},50,126)`}><line x1="12" y1="126" x2="88" y2="126" stroke="#f59e0b" strokeWidth="7" strokeLinecap="round" /></g>
      <text x="50" y="146" textAnchor="middle" fill="#94a3b8" fontSize="11">slope {Math.round(dip)}°</text>
    </svg>
  </div>;
}

export function CompassModal({ open, onClose, onCapture }: Props) {
  const [status, setStatus] = useState<"starting" | "active" | "unavailable" | "error">("starting");
  const [error, setError] = useState("");
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [filtered, setFiltered] = useState({ strike: null as number | null, dipDirection: null as number | null, dip: 0 });
  const [stable, setStable] = useState(false);
  const [mockDip, setMockDip] = useState(30);
  const [mockDirection, setMockDirection] = useState(90);
  const history = useRef<Array<{ strike: number | null; dipDirection: number | null; dip: number }>>([]);
  const native = Capacitor.isNativePlatform();

  const process = (raw: SensorReading) => {
    let normal = { east: raw.normalEast, north: raw.normalNorth, up: raw.normalUp };
    const hasTrue = typeof raw.trueHeading === "number" && typeof raw.magneticHeading === "number";
    if (hasTrue) normal = rotateMagneticNormalToTrue(normal, raw.trueHeading! - raw.magneticHeading!);
    const result = planeOrientationFromNormal(normal);
    history.current = [...history.current.slice(-(STABILITY_WINDOW - 1)), result];
    const azimuths = history.current.map((item) => item.dipDirection).filter((value): value is number => value !== null);
    const meanDirection = circularMean(azimuths);
    const meanDip = history.current.reduce((sum, item) => sum + item.dip, 0) / history.current.length;
    const isStable = history.current.length >= STABILITY_WINDOW && history.current.every((item) => Math.abs(item.dip - meanDip) <= DIP_TOLERANCE && (meanDirection === null || item.dipDirection === null || angularDistance(item.dipDirection, meanDirection) <= AZIMUTH_TOLERANCE));
    setReading({ ...raw, normalEast: normal.east, normalNorth: normal.north, normalUp: normal.up });
    setFiltered({ dip: meanDip, dipDirection: meanDirection, strike: meanDirection === null ? null : normalizeAzimuth(meanDirection - 90) });
    setStable(isStable); setStatus("active");
  };

  useEffect(() => {
    if (!open) return;
    history.current = []; setStatus("starting"); setError(""); setStable(false);
    let listener: PluginListenerHandle | undefined;
    if (!native) { setStatus("unavailable"); return; }
    void (async () => {
      try {
        if (!(await GeologyMotion.available()).available) throw new Error("Compass or full device motion is unavailable.");
        listener = await GeologyMotion.addListener("orientation", process);
        await GeologyMotion.start();
      } catch (cause: any) { setError(cause?.message || "Could not start geological compass."); setStatus("error"); }
    })();
    return () => { void listener?.remove(); void GeologyMotion.stop().catch(() => undefined); };
  }, [open, native]);

  const northReference: "true" | "magnetic" = typeof reading?.trueHeading === "number" ? "true" : "magnetic";
  const accuracyLow = typeof reading?.headingAccuracy === "number" && reading.headingAccuracy > 20;
  const diagnostic = useMemo(() => reading ? JSON.stringify({ quaternion: [reading.quaternionX, reading.quaternionY, reading.quaternionZ, reading.quaternionW], gravity: [reading.gravityX, reading.gravityY, reading.gravityZ], normalENU: [reading.normalEast, reading.normalNorth, reading.normalUp], heading: { magnetic: reading.magneticHeading, true: reading.trueHeading, accuracy: reading.headingAccuracy }, filtered, screenOrientation: screen.orientation?.type }, null, 2) : "No reading", [reading, filtered]);
  if (!open) return null;

  const useMock = () => {
    const normal = normalForDip(mockDip, mockDirection);
    process({ normalEast: normal.east, normalNorth: normal.north, normalUp: normal.up, gravityX: 0, gravityY: 0, gravityZ: -1, quaternionX: 0, quaternionY: 0, quaternionZ: 0, quaternionW: 1, magneticHeading: 0, headingAccuracy: 0, referenceFrame: "mock" });
    history.current = Array(STABILITY_WINDOW).fill(planeOrientationFromNormal(normal)); process({ normalEast: normal.east, normalNorth: normal.north, normalUp: normal.up, gravityX: 0, gravityY: 0, gravityZ: -1, quaternionX: 0, quaternionY: 0, quaternionZ: 0, quaternionW: 1, magneticHeading: 0, headingAccuracy: 0, referenceFrame: "mock" });
  };
  const capture = () => {
    if (filtered.strike === null || filtered.dipDirection === null || !reading) return;
    onCapture({ strikeDegrees: Math.round(filtered.strike), dipDegrees: Number(filtered.dip.toFixed(1)), dipDirectionDegrees: Math.round(filtered.dipDirection), convention: "right-hand-rule", northReference, compassAccuracy: reading.headingAccuracy, orientationQuaternion: { x: reading.quaternionX, y: reading.quaternionY, z: reading.quaternionZ, w: reading.quaternionW }, planeNormal: { east: reading.normalEast, north: reading.normalNorth, up: reading.normalUp }, quality: stable ? "stable" : "unstable" }); onClose();
  };

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 backdrop-blur-sm"><div className="mx-auto my-2 max-w-md rounded-2xl border border-white/10 bg-[#0d1117] text-slate-100 shadow-2xl">
    <div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-semibold">Geological Compass</h2><p className="text-xs text-slate-400">Right-hand-rule · {northReference} north</p></div><button onClick={onClose} className="rounded-full p-3 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
    <div className="space-y-4 px-5 pb-6">
      <div className="flex gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200"><Smartphone className="h-4 w-4 shrink-0" /><span>Place the <strong>back of the phone flat against the surface</strong> and hold steady. Phone orientation does not matter.</span></div>
      {status === "starting" && <p className="py-8 text-center text-sm text-slate-400">Getting full 3D orientation and compass…</p>}
      {status === "error" && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
      {(status === "active" || reading) && <>
        <PlaneCompass strike={filtered.strike} dipDirection={filtered.dipDirection} dip={filtered.dip} />
        <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] uppercase text-slate-500">Strike RHR</p><p className="font-mono text-xl">{fmt(filtered.strike)}</p><p className="text-xs text-slate-400">{cardinalDirection(filtered.strike)}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] uppercase text-slate-500">Dip direction</p><p className="font-mono text-xl">{fmt(filtered.dipDirection)}</p><p className="text-xs text-slate-400">{cardinalDirection(filtered.dipDirection)}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] uppercase text-slate-500">Dip</p><p className="font-mono text-xl">{Math.round(filtered.dip)}°</p></div></div>
        <div className={`flex items-center gap-2 rounded-xl p-3 text-sm ${stable ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>{stable ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{stable ? "Stable — ready to capture" : "Hold steady to capture"}</div>
        {accuracyLow && <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-300">Compass accuracy is low. Move iPhone in a figure-eight and keep it away from magnets or metal objects.</p>}
        <Button className="w-full" disabled={!stable || filtered.strike === null} onClick={capture}>Capture Measurement</Button>
      </>}
      {(!native || (import.meta.env.DEV && status === "error")) && <div className="space-y-3 rounded-xl border border-dashed border-slate-600 p-3"><p className="text-xs text-amber-300">Simulator/manual sensor mode — not a real measurement.</p><label className="block text-xs">Dip {mockDip}°<input className="w-full" type="range" min="0" max="90" value={mockDip} onChange={(e) => setMockDip(Number(e.target.value))} /></label><label className="block text-xs">Dip direction {mockDirection}°<input className="w-full" type="range" min="0" max="359" value={mockDirection} onChange={(e) => setMockDirection(Number(e.target.value))} /></label><Button variant="outline" className="w-full" onClick={useMock}>Apply Mock Reading</Button></div>}
      {import.meta.env.DEV && <details className="text-xs text-slate-400"><summary>Developer diagnostics</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2">{diagnostic}</pre></details>}
      <p className="text-center text-[10px] text-slate-500">Field aid only; not survey-grade. Horizontal planes below 1° have no defined strike or dip direction.</p>
    </div></div></div>;
}

export type { Capture as StrikeDipCapture };
