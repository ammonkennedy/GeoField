import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { X, CheckCircle, Smartphone, AlertTriangle } from "lucide-react";

interface CompassModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (strike: string, dip: string) => void;
}

type PermState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

function toDeg(rad: number) { return rad * (180 / Math.PI); }
function toRad(deg: number) { return deg * (Math.PI / 180); }
function mod360(n: number) { return ((n % 360) + 360) % 360; }

function formatBearing(deg: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(mod360(deg) / 22.5) % 16];
}

/* ── SVG Compass Rose ────────────────────────────────────────────────────── */
function CompassRose({ heading }: { heading: number | null }) {
  const cx = 110, cy = 110, r = 100;

  // Tick marks every 5°; longer at 10°, longest at 90°
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const deg = i * 5;
    const isCardinal = deg % 90 === 0;
    const isMajor = deg % 30 === 0;
    const len = isCardinal ? 18 : isMajor ? 12 : 7;
    const width = isCardinal ? 2 : isMajor ? 1.5 : 1;
    const rad = toRad(deg - 90);
    const x1 = cx + (r - 2) * Math.cos(rad);
    const y1 = cy + (r - 2) * Math.sin(rad);
    const x2 = cx + (r - 2 - len) * Math.cos(rad);
    const y2 = cy + (r - 2 - len) * Math.sin(rad);
    return { x1, y1, x2, y2, width, isCardinal };
  });

  // Degree labels at 0, 45, 90 … 315
  const degLabels = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const rad = toRad(deg - 90);
    const dist = r - 30;
    return {
      deg,
      x: cx + dist * Math.cos(rad),
      y: cy + dist * Math.sin(rad),
      isCardinal: deg % 90 === 0,
    };
  });

  const cardinalNames: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };

  const needleRot = heading !== null ? -heading : 0;

  return (
    <svg viewBox="0 0 220 220" className="w-56 h-56 drop-shadow-xl">
      {/* Outer bezel */}
      <circle cx={cx} cy={cy} r={r + 6} fill="#1a1f2e" />
      {/* Subtle gradient on bezel */}
      <defs>
        <radialGradient id="bezel" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#2d3448" />
          <stop offset="100%" stopColor="#0f1117" />
        </radialGradient>
        <radialGradient id="face" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#1e2435" />
          <stop offset="100%" stopColor="#111520" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + 6} fill="url(#bezel)" />
      {/* Compass face */}
      <circle cx={cx} cy={cy} r={r} fill="url(#face)" />
      {/* Inner decorative ring */}
      <circle cx={cx} cy={cy} r={r - 22} fill="none" stroke="#2a3050" strokeWidth="0.5" />

      {/* Tick marks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={t.isCardinal ? "#7ba7e8" : "#3d4a6a"}
          strokeWidth={t.width}
          strokeLinecap="round"
        />
      ))}

      {/* Degree / cardinal labels */}
      {degLabels.map(({ deg, x, y, isCardinal }) => (
        <text
          key={deg}
          x={x} y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={isCardinal ? 11 : 8}
          fontWeight={isCardinal ? "700" : "400"}
          fontFamily="system-ui, sans-serif"
          fill={isCardinal ? "#a8c4f0" : "#5a6a90"}
          letterSpacing="0"
        >
          {isCardinal ? cardinalNames[deg] : deg}
        </text>
      ))}

      {/* Rotating needle group */}
      <g
        transform={`rotate(${needleRot}, ${cx}, ${cy})`}
        style={{ transition: heading !== null ? "transform 0.12s ease-out" : "none" }}
      >
        {/* North half — red */}
        <path
          d={`M ${cx} ${cy - 68} L ${cx - 7} ${cy + 4} L ${cx + 7} ${cy + 4} Z`}
          fill="#e84545"
          opacity="0.95"
        />
        {/* South half — muted blue-grey */}
        <path
          d={`M ${cx} ${cy + 68} L ${cx - 7} ${cy - 4} L ${cx + 7} ${cy - 4} Z`}
          fill="#4a5678"
          opacity="0.9"
        />
        {/* North cap highlight */}
        <path
          d={`M ${cx} ${cy - 68} L ${cx - 3} ${cy - 30} L ${cx} ${cy - 28} Z`}
          fill="#ff6b6b"
          opacity="0.5"
        />
      </g>

      {/* Center cap */}
      <circle cx={cx} cy={cy} r={7} fill="#1a1f2e" />
      <circle cx={cx} cy={cy} r={4.5} fill="#7ba7e8" />
      <circle cx={cx} cy={cy} r={2} fill="#c8dbf8" />

      {/* Heading text below center */}
      <text
        x={cx} y={cy + 85}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="'SF Mono', 'Fira Mono', monospace"
        fill="#a8c4f0"
        letterSpacing="1"
      >
        {heading !== null ? `${Math.round(heading).toString().padStart(3, "0")}°` : "---°"}
      </text>
    </svg>
  );
}

/* ── Inclinometer arc ────────────────────────────────────────────────────── */
function DipMeter({ dip }: { dip: number }) {
  // Semi-circle 0–90°
  const cx = 80, cy = 70, r = 52;
  // Map 0-90° to 180°-90° arc on the SVG (left to right)
  const toAngle = (d: number) => toRad(180 - d); // 0° → 180deg, 90° → 90deg
  const dipRad = toAngle(Math.min(dip, 90));

  const px = cx + r * Math.cos(dipRad);
  const py = cy - r * Math.sin(toRad(dip)); // simple upward pointer

  // Arc path for the colored fill
  const arcEnd = toAngle(Math.min(dip, 90));
  const startX = cx - r, startY = cy;
  const endX = cx + r * Math.cos(arcEnd);
  const endY = cy - r * Math.sin(arcEnd - Math.PI) * -1; // recalculate

  // Simpler: use path sweep
  const needleAngle = 180 - dip; // degrees from left (0° of dip = 180° in SVG coords)
  const needleRad = toRad(needleAngle);
  const needleX = cx + r * Math.cos(needleRad);
  const needleY = cy + r * Math.sin(needleRad); // SVG y is inverted

  // Color by dip
  const color = dip > 60 ? "#e84545" : dip > 30 ? "#f59e0b" : "#22c55e";

  // Build arc path from 180° to needleAngle
  const largeArc = dip > 90 ? 1 : 0;
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${needleX} ${needleY}`;

  return (
    <svg viewBox="0 0 160 80" className="w-40 h-20">
      {/* Background arc (full 0-90°) */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#2a3050"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Filled arc up to dip */}
      {dip > 0 && (
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          style={{ transition: "all 0.15s ease-out" }}
        />
      )}
      {/* Tick marks at 30 and 60 */}
      {[30, 60].map((d) => {
        const a = toRad(180 - d);
        const ix = cx + (r - 4) * Math.cos(a), iy = cy + (r - 4) * Math.sin(a);
        const ox = cx + (r + 4) * Math.cos(a), oy = cy + (r + 4) * Math.sin(a);
        return <line key={d} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#3d4a6a" strokeWidth="1.5" />;
      })}
      {/* Needle pointer */}
      <line
        x1={cx} y1={cy}
        x2={needleX} y2={needleY}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ transition: "all 0.15s ease-out" }}
      />
      <circle cx={cx} cy={cy} r="3" fill="#1a1f2e" stroke={color} strokeWidth="1.5" />
      {/* Labels */}
      <text x={cx - r - 4} y={cy + 14} textAnchor="middle" fontSize="9" fill="#5a6a90" fontFamily="monospace">0°</text>
      <text x={cx + r + 4} y={cy + 14} textAnchor="middle" fontSize="9" fill="#5a6a90" fontFamily="monospace">90°</text>
      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize="9" fill="#5a6a90" fontFamily="monospace">45°</text>
    </svg>
  );
}

/* ── Main modal ──────────────────────────────────────────────────────────── */
export function CompassModal({ open, onClose, onCapture }: CompassModalProps) {
  const [permState, setPermState] = useState<PermState>("idle");
  const [alpha, setAlpha] = useState<number | null>(null);
  const [dip, setDip] = useState<number>(0);
  const [locked, setLocked] = useState(false);
  const [lockedStrike, setLockedStrike] = useState<number>(0);
  const [lockedDip, setLockedDip] = useState<number>(0);
  const orientRef = useRef<{ alpha: number; dip: number }>({ alpha: 0, dip: 0 });

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const a = e.alpha;
    const bRad = toRad(e.beta);
    const gRad = toRad(e.gamma);
    const dipAngle = Math.round(toDeg(Math.acos(
      Math.min(1, Math.abs(Math.cos(bRad) * Math.cos(gRad)))
    )));
    orientRef.current = { alpha: a, dip: dipAngle };
    setAlpha(mod360(a));
    setDip(dipAngle);
  }, []);

  const startListening = useCallback(() => {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }, [handleOrientation]);

  const requestPermission = useCallback(async () => {
    setPermState("requesting");
    const DOE = DeviceOrientationEvent as any;
    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") { setPermState("granted"); startListening(); }
        else setPermState("denied");
      } catch { setPermState("denied"); }
    } else if (window.DeviceOrientationEvent) {
      setPermState("granted");
      startListening();
    } else {
      setPermState("unavailable");
    }
  }, [startListening]);

  useEffect(() => {
    if (!open) return;
    setLocked(false);
    setAlpha(null);
    setDip(0);
    const DOE = DeviceOrientationEvent as any;
    if (typeof DOE.requestPermission !== "function") {
      if (window.DeviceOrientationEvent) { setPermState("granted"); startListening(); }
      else setPermState("unavailable");
    } else {
      setPermState("idle");
    }
    return () => { window.removeEventListener("deviceorientation", handleOrientation, true); };
  }, [open, handleOrientation, startListening]);

  if (!open) return null;

  const strike = alpha !== null ? mod360(alpha) : 0;
  const dipDirection = alpha !== null ? mod360(alpha + 90) : 0;

  const handleLock = () => {
    const s = Math.round(orientRef.current.alpha);
    const d = orientRef.current.dip;
    setLockedStrike(mod360(s));
    setLockedDip(d);
    setLocked(true);
  };

  const handleSave = () => {
    onCapture(
      `${lockedStrike.toString().padStart(3, "0")}°`,
      `${lockedDip}°`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-[#0d1117] rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-white/5">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="text-sm font-semibold text-slate-300 tracking-widest uppercase">
            Strike &amp; Dip
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">

          {/* Instruction */}
          <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2.5 text-xs text-blue-300">
            <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Place phone <strong>face-up flat on the rock</strong>, top edge along strike direction, then tap Lock.</span>
          </div>

          {/* Permission states */}
          {permState === "idle" && (
            <div className="py-4 space-y-3 text-center">
              <p className="text-sm text-slate-400">This device requires permission to access the compass.</p>
              <Button onClick={requestPermission} className="w-full">Enable Compass</Button>
            </div>
          )}
          {permState === "requesting" && (
            <div className="py-6 text-center text-sm text-slate-500">Requesting sensor access…</div>
          )}
          {permState === "denied" && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Access denied. Allow motion &amp; orientation in device settings, then reopen.</span>
            </div>
          )}
          {permState === "unavailable" && (
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 text-xs text-yellow-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>No orientation sensor detected. Enter strike and dip manually.</span>
            </div>
          )}

          {permState === "granted" && (
            <>
              {/* Compass */}
              <div className="flex justify-center pt-1">
                <CompassRose heading={alpha} />
              </div>

              {/* Dip meter + readouts side by side */}
              <div className="grid grid-cols-2 gap-3 items-center">
                {/* Inclinometer */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500 uppercase tracking-widest">Dip</span>
                  <DipMeter dip={dip} />
                  <span className="font-mono font-bold text-2xl text-slate-100 -mt-1">{dip}°</span>
                  {alpha !== null && (
                    <span className="text-xs text-slate-500">dir. {formatBearing(dipDirection)}</span>
                  )}
                </div>

                {/* Strike readout */}
                <div className="flex flex-col items-center gap-1 bg-white/3 rounded-2xl p-4 border border-white/5">
                  <span className="text-xs text-slate-500 uppercase tracking-widest">Strike</span>
                  <span className="font-mono font-bold text-3xl text-slate-100 tabular-nums">
                    {alpha !== null ? `${Math.round(strike).toString().padStart(3, "0")}°` : "--°"}
                  </span>
                  <span className="text-sm text-slate-400 font-medium">
                    {alpha !== null ? formatBearing(strike) : ""}
                  </span>
                </div>
              </div>

              {/* Locked result */}
              {locked && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 text-sm text-emerald-300">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Strike <strong>{lockedStrike.toString().padStart(3, "0")}°</strong> &middot; Dip <strong>{lockedDip}°</strong>
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                {!locked ? (
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    onClick={handleLock}
                    disabled={alpha === null}
                  >
                    Lock Measurement
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1 border-white/10 text-slate-300 hover:bg-white/5" onClick={() => setLocked(false)}>
                      Re-measure
                    </Button>
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold" onClick={handleSave}>
                      Save to Form
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
