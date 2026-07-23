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
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5);
  const labels = Array.from({ length: 12 }, (_, index) => index * 30);
  return <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[310px] drop-shadow-2xl" aria-label="Geological strike and dip instrument">
    <defs>
      <radialGradient id="geoFace" cx="42%" cy="35%"><stop offset="0" stopColor="#202a3a" /><stop offset="0.68" stopColor="#101722" /><stop offset="1" stopColor="#080d14" /></radialGradient>
      <filter id="geoGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <circle cx="150" cy="150" r="143" fill="#05080d" stroke="#64748b" strokeWidth="2" />
    <circle cx="150" cy="150" r="136" fill="url(#geoFace)" stroke="#293548" strokeWidth="2" />
    <circle cx="150" cy="150" r="108" fill="none" stroke="#334155" strokeWidth="1" />
    {ticks.map((degree) => { const angle = (degree - 90) * Math.PI / 180; const major = degree % 30 === 0; const medium = degree % 10 === 0; const outer = 132; const inner = major ? 116 : medium ? 120 : 125; return <line key={degree} x1={150 + outer * Math.cos(angle)} y1={150 + outer * Math.sin(angle)} x2={150 + inner * Math.cos(angle)} y2={150 + inner * Math.sin(angle)} stroke={major ? "#e2e8f0" : medium ? "#94a3b8" : "#526176"} strokeWidth={major ? 2 : 1} />; })}
    {labels.map((degree) => { const angle = (degree - 90) * Math.PI / 180; return <text key={degree} x={150 + 99 * Math.cos(angle)} y={150 + 99 * Math.sin(angle) + 4} textAnchor="middle" fill="#94a3b8" fontFamily="ui-monospace, SFMono-Regular" fontSize="9">{degree}</text>; })}
    {[["N",150,34],["E",266,154],["S",150,274],["W",34,154]].map(([label,x,y]) => <text key={String(label)} x={Number(x)} y={Number(y)} textAnchor="middle" fill={label === "N" ? "#fb7185" : "#e2e8f0"} fontSize="14" fontWeight="800">{label}</text>)}
    {strike !== null && <g transform={`rotate(${strike},150,150)`} filter="url(#geoGlow)"><line x1="150" y1="52" x2="150" y2="248" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" /><line x1="150" y1="56" x2="150" y2="244" stroke="#dbeafe" strokeWidth="1" /><path d="M150 44 L143 58 L157 58 Z" fill="#93c5fd" /><path d="M150 256 L143 242 L157 242 Z" fill="#93c5fd" /></g>}
    {dipDirection !== null && <g transform={`rotate(${dipDirection},150,150)`}><line x1="150" y1="150" x2="150" y2="83" stroke="#fbbf24" strokeWidth="3" strokeDasharray="5 4" /><path d="M150 72 L143 87 L157 87 Z" fill="#fbbf24" /></g>}
    <circle cx="150" cy="150" r="40" fill="#0a1019" stroke="#64748b" strokeWidth="2" />
    <circle cx="150" cy="150" r="29" fill="none" stroke="#334155" />
    <line x1="137" y1="150" x2="163" y2="150" stroke="#64748b" /><line x1="150" y1="137" x2="150" y2="163" stroke="#64748b" />
    <circle cx="150" cy="150" r="5" fill="#f8fafc" stroke="#60a5fa" strokeWidth="2" />
    <g transform={`rotate(${-Math.min(90, Math.max(0, dip))},150,150)`}><line x1="128" y1="181" x2="172" y2="181" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" /></g>
    <text x="150" y="205" textAnchor="middle" fill="#94a3b8" fontSize="8" letterSpacing="1.4">PLANE ATTITUDE</text>
  </svg>;
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
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#121a27] to-[#080d14] px-3 pb-5 pt-5 shadow-inner">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 px-3 py-3 text-center shadow-lg"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-blue-200/70">Strike · RHR</p><p className="font-mono text-2xl font-bold tabular-nums text-white">{fmt(filtered.strike)}</p><p className="text-[10px] text-blue-200/70">{cardinalDirection(filtered.strike)}</p></div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-center shadow-lg"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Dip</p><p className="font-mono text-2xl font-bold tabular-nums text-white">{Math.round(filtered.dip)}°</p><p className="text-[10px] text-amber-200/70">plane slope</p></div>
          </div>
          <PlaneCompass strike={filtered.strike} dipDirection={filtered.dipDirection} dip={filtered.dip} />
          <div className="mt-1 flex items-center justify-center gap-4 text-[9px] uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-blue-400" />Strike</span><span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t-2 border-dashed border-amber-400" />Down-dip indicator</span></div>
        </div>
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
