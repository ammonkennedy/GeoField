import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  greatCircle,
  smallCircle,
  project,
  line,
  type Vec,
} from "@/lib/stereonet/math";
import {
  type Stereonet,
  type NetMeasurement,
  measurementVector,
} from "@/lib/stereonet/model";
import { Button } from "./ui/button";
export interface NetAnalysis {
  label: string;
  trend: number;
  plunge: number;
  strike?: number;
  dip?: number;
}
const path = (vectors: Vec[]) =>
  vectors
    .map((v, i) => {
      const [x, y] = project(v);
      return `${i ? "L" : "M"}${300 + x * 250},${300 + y * 250}`;
    })
    .join(" ");
export function StereonetPlot({
  net,
  items,
  analysis,
  onSelect,
  svgRef,
}: {
  net: Stereonet;
  items: NetMeasurement[];
  analysis?: NetAnalysis;
  onSelect?: (id: string) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const limit = 250 * (zoom - 1);
    setPan((p) => ({
      x: Math.max(-limit, Math.min(limit, p.x)),
      y: Math.max(-limit, Math.min(limit, p.y)),
    }));
  }, [zoom]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    { x: number; y: number; id?: string; moved: boolean } | undefined
  >(undefined);
  const clip = useId().replace(/:/g, "");
  const grid = useMemo(
    () => [
      ...Array.from({ length: 17 }, (_, i) =>
        greatCircle(i < 9 ? 0 : 180, i < 9 ? (i + 1) * 10 : (i - 8) * 10),
      ),
      ...Array.from({ length: 17 }, (_, i) => smallCircle((i + 1) * 10)),
    ],
    [],
  );
  const legendHeight = net.groups.filter((g) => g.visible).length * 40;
  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (
      gesture.current &&
      Math.hypot(
        event.clientX - gesture.current.x,
        event.clientY - gesture.current.y,
      ) > 6
    )
      gesture.current.moved = true;
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current.entries()].find(
      ([id]) => id !== event.pointerId,
    )?.[1];
    if (other) {
      const before = Math.hypot(old.x - other.x, old.y - other.y),
        after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 1)
        setZoom((z) => Math.min(4, Math.max(1, (z * after) / before)));
    } else if (zoom > 1) {
      const scale = 600 / event.currentTarget.getBoundingClientRect().width;
      setPan((p) => ({
        x: Math.max(
          -250 * (zoom - 1),
          Math.min(250 * (zoom - 1), p.x + (next.x - old.x) * scale),
        ),
        y: Math.max(
          -250 * (zoom - 1),
          Math.min(250 * (zoom - 1), p.y + (next.y - old.y) * scale),
        ),
      }));
    }
    pointers.current.set(event.pointerId, next);
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
        >
          −
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
        >
          +
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </Button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 600 ${660 + legendHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-2xl mx-auto bg-white rounded-xl"
        style={{ touchAction: "none" }}
        role="img"
        aria-label={`${net.name}, lower hemisphere equal-area stereonet`}
        onPointerDown={(e) => {
          if (pointers.current.size && gesture.current)
            gesture.current.moved = true;
          else
            gesture.current = {
              x: e.clientX,
              y: e.clientY,
              id:
                (e.target as Element)
                  .closest("[data-measurement]")
                  ?.getAttribute("data-measurement") ?? undefined,
              moved: false,
            };
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerMove={move}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (gesture.current?.id && !gesture.current.moved)
            onSelect?.(gesture.current.id);
          if (!pointers.current.size) gesture.current = undefined;
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      >
        <rect width="600" height={660 + legendHeight} fill="white" />
        <defs>
          <clipPath id={clip}>
            <circle cx="300" cy="300" r="250" />
          </clipPath>
        </defs>
        <g
          fontFamily="Arial, sans-serif"
          fill="#172033"
          fontSize="16"
          textAnchor="middle"
        >
          <text x="300" y="22">
            N
          </text>
          <text x="580" y="306">
            E
          </text>
          <text x="300" y="580">
            S
          </text>
          <text x="20" y="306">
            W
          </text>
        </g>
        <g clipPath={`url(#${clip})`}>
          <g
            data-net-geometry="true"
            transform={`translate(${pan.x} ${pan.y}) translate(300 300) scale(${zoom}) translate(-300 -300)`}
          >
            {net.grid &&
              grid.map((v, i) => (
                <path
                  key={i}
                  d={path(v)}
                  stroke="#d3dce6"
                  strokeWidth="0.7"
                  fill="none"
                />
              ))}
            {items.map((m) => {
              const group = net.groups.find((g) => g.id === m.groupId)!;
              const [x, y] = project(measurementVector(m)),
                cx = 300 + x * 250,
                cy = 300 + y * 250;
              return (
                <g
                  key={m.id}
                  data-measurement={m.id}
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                >
                  <title>
                    {m.name || m.feature}: {m.azimuth.toFixed(1)} /{" "}
                    {m.inclination.toFixed(1)}° ({net.north})
                  </title>
                  {m.kind === "plane" && net.display !== "poles" && (
                    <path
                      d={path(greatCircle(m.azimuth, m.inclination))}
                      stroke={group.color}
                      strokeWidth="1.8"
                      fill="none"
                    />
                  )}
                  {(m.kind === "line" || net.display !== "planes") && (
                    <g
                      fill={group.color}
                      stroke={m.kind === "line" ? "#111827" : "white"}
                      strokeWidth="1"
                    >
                      {group.symbol === "square" ? (
                        <rect x={cx - 4} y={cy - 4} width="8" height="8" />
                      ) : group.symbol === "triangle" ? (
                        <path d={`M${cx},${cy - 5} l5,9 h-10 Z`} />
                      ) : (
                        <circle cx={cx} cy={cy} r={4} />
                      )}
                    </g>
                  )}
                </g>
              );
            })}
            {analysis && (
              <g stroke="#b91c1c" fill="none" strokeWidth="2.5">
                {analysis.strike !== undefined && (
                  <path
                    d={path(greatCircle(analysis.strike, analysis.dip!))}
                    strokeDasharray="6 4"
                  />
                )}
                {(() => {
                  const [x, y] = project(line(analysis.trend, analysis.plunge));
                  return <circle cx={300 + x * 250} cy={300 + y * 250} r="8" />;
                })()}
              </g>
            )}
          </g>
        </g>
        <circle
          cx="300"
          cy="300"
          r="250"
          stroke="#334155"
          strokeWidth="1.5"
          fill="none"
        />
        <g fontFamily="Arial, sans-serif" fill="#172033" fontSize="13">
          <text x="30" y="608">
            {net.name.slice(0, 65)}
          </text>
          <text x="30" y="630">
            Lower hemisphere · Schmidt equal-area · {net.north} north ·{" "}
            {items.length} measurements
          </text>
          {net.groups
            .filter((g) => g.visible)
            .map((g, i) => (
              <g key={g.id} fill={g.color}>
                <text x="30" y={652 + i * 40}>
                  {g.symbol === "circle"
                    ? "●"
                    : g.symbol === "square"
                      ? "■"
                      : "▲"}{" "}
                  {g.name.slice(0, 45)} — planes: {net.display}; lines: points
                </text>
                <text x="45" y={668 + i * 40} fontSize="11">
                  Source north:{" "}
                  {[
                    ...new Set(
                      net.measurements
                        .filter((m) => m.groupId === g.id)
                        .map((m) => m.north),
                    ),
                  ].join(", ") || "no measurements"}
                  {g.assumedNorth ? ` (unknown assumed ${g.assumedNorth})` : ""}{" "}
                  → {net.north}
                </text>
              </g>
            ))}
        </g>
      </svg>
    </div>
  );
}
