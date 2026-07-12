import { useState, useMemo, useRef } from "react";
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
  ReferenceLine,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { BarChart2, ChevronDown, Download } from "lucide-react";
import type { Sample } from "@workspace/api-client-react";

const NUMERIC_PARAMS: Record<string, { label: string; unit: string; type: string }> = {
  temperature:    { label: "Water Temp",         unit: "°C",     type: "water" },
  ph:             { label: "pH Level",            unit: "",       type: "any"   },
  do:             { label: "Dissolved Oxygen",    unit: "mg/L",   type: "water" },
  conductivity:   { label: "Conductivity",        unit: "μS/cm",  type: "water" },
  turbidity:      { label: "Turbidity",           unit: "NTU",    type: "water" },
  flowRate:       { label: "Flow Rate",           unit: "m³/s",   type: "water" },
  hardness:       { label: "Hardness",            unit: "Mohs",   type: "rock"  },
  specificGravity:{ label: "Specific Gravity",    unit: "",       type: "rock"  },
  weight:         { label: "Weight",              unit: "g",      type: "any"   },
  depth:          { label: "Depth",               unit: "cm",     type: "soil_sand" },
  organicMatter:  { label: "Organic Matter",      unit: "%",      type: "soil_sand" },
  pidReading:     { label: "PID Reading",         unit: "",       type: "air" },
  correctionFactor:{ label: "Correction Factor",  unit: "",       type: "air" },
  calibrationConcentration:{ label: "Calibration Concentration", unit: "", type: "air" },
  alarmLevel:     { label: "Alarm Level",         unit: "",       type: "air" },
  sampleDuration: { label: "Sample Duration",     unit: "s",      type: "air" },
  airFlowRate:    { label: "Flow Rate",           unit: "L/min",  type: "air" },
  ambientTemperature:{ label: "Ambient Temp",     unit: "°C",     type: "air" },
  relativeHumidity:{ label: "Relative Humidity",  unit: "%",      type: "air" },
  barometricPressure:{ label: "Barometric Pressure", unit: "",    type: "air" },
  windSpeed:      { label: "Wind Speed",          unit: "",       type: "air" },
};

const TYPE_COLORS: Record<string, string> = {
  water:     "#2d7dd2",
  rock:      "#8b5e3c",
  soil_sand: "#c49a3c",
  air:       "#1f9d8a",
};

type ChartType = "bar" | "scatter" | "compare";

const CHART_OPTIONS: { id: ChartType; label: string }[] = [
  { id: "bar",     label: "Bar Chart"          },
  { id: "scatter", label: "Scatter (vs Index)" },
  { id: "compare", label: "Side-by-Side Types" },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold">{d?.name}</p>
      <p className="text-muted-foreground">
        {payload[0]?.name}: <strong>{payload[0]?.value}</strong>{" "}
        {d?.unit}
      </p>
      {d?.type && (
        <p className="text-xs text-muted-foreground mt-1 capitalize">
          Type: {d.type.replace("_", "/")}
        </p>
      )}
    </div>
  );
}

function BarFigure({
  data,
  paramLabel,
  paramUnit,
}: {
  data: any[];
  paramLabel: string;
  paramUnit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          label={{ value: `${paramLabel}${paramUnit ? ` (${paramUnit})` : ""}`, angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
          tick={{ fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={data.reduce((s, d) => s + d.value, 0) / (data.length || 1)}
          stroke="#888"
          strokeDasharray="4 4"
          label={{ value: "avg", position: "right", fontSize: 10, fill: "#888" }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={TYPE_COLORS[d.type] || "#8884d8"} opacity={0.85} />
          ))}
          <LabelList dataKey="value" position="top" style={{ fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ScatterFigure({ data, paramLabel, paramUnit }: { data: any[]; paramLabel: string; paramUnit: string }) {
  const withIndex = data.map((d, i) => ({ ...d, index: i + 1 }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="index" name="Sample #" tick={{ fontSize: 11 }} label={{ value: "Sample #", position: "insideBottom", offset: -10, fontSize: 11 }} />
        <YAxis
          dataKey="value"
          name={paramLabel}
          label={{ value: `${paramLabel}${paramUnit ? ` (${paramUnit})` : ""}`, angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
          tick={{ fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={withIndex}>
          {withIndex.map((d, i) => (
            <Cell key={i} fill={TYPE_COLORS[d.type] || "#8884d8"} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function CompareFigure({ data, paramLabel, paramUnit }: { data: any[]; paramLabel: string; paramUnit: string }) {
  const types = [...new Set(data.map((d) => d.type))];
  const grouped = types.map((t) => {
    const items = data.filter((d) => d.type === t);
    const avg = items.reduce((s, d) => s + d.value, 0) / items.length;
    const min = Math.min(...items.map((d) => d.value));
    const max = Math.max(...items.map((d) => d.value));
    return {
      type: t,
      avg: parseFloat(avg.toFixed(3)),
      min: parseFloat(min.toFixed(3)),
      max: parseFloat(max.toFixed(3)),
      count: items.length,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={grouped} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="type" tick={{ fontSize: 12 }} tickFormatter={(t) => t.replace("_", "/")} />
        <YAxis
          label={{ value: `${paramLabel}${paramUnit ? ` (${paramUnit})` : ""}`, angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(val: any, name: string) => [`${val} ${paramUnit}`, name]}
          labelFormatter={(l) => `Type: ${String(l).replace("_", "/")}`}
        />
        <Legend />
        <Bar dataKey="avg" name="Average" radius={[4, 4, 0, 0]}>
          {grouped.map((d, i) => (
            <Cell key={i} fill={TYPE_COLORS[d.type] || "#8884d8"} opacity={0.85} />
          ))}
          <LabelList dataKey="avg" position="top" style={{ fontSize: 11 }} />
        </Bar>
        <Bar dataKey="min" name="Min" fill="#94a3b8" opacity={0.5} radius={[4, 4, 0, 0]} />
        <Bar dataKey="max" name="Max" fill="#64748b" opacity={0.5} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DatasetFigures({ samples, datasetName }: { samples: Sample[]; datasetName?: string }) {
  const [open, setOpen] = useState(false);
  const [selectedParam, setSelectedParam] = useState<string>("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [isDownloading, setIsDownloading] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const availableParams = useMemo(() => {
    return Object.entries(NUMERIC_PARAMS).filter(([key]) =>
      samples.some((s) => {
        const val = (s.fields as any)?.[key];
        return val !== undefined && val !== null && val !== "" && !isNaN(Number(val));
      })
    );
  }, [samples]);

  const chartData = useMemo(() => {
    if (!selectedParam) return [];
    return samples
      .map((s) => {
        const raw = (s.fields as any)?.[selectedParam];
        const val = raw !== undefined && raw !== null && raw !== "" ? Number(raw) : null;
        if (val === null || isNaN(val)) return null;
        const meta = NUMERIC_PARAMS[selectedParam];
        return {
          name: s.sampleId,
          value: val,
          type: s.sampleType,
          unit: meta.unit,
        };
      })
      .filter(Boolean) as any[];
  }, [samples, selectedParam]);

  const paramMeta = selectedParam ? NUMERIC_PARAMS[selectedParam] : null;

  const downloadChart = () => {
    if (!chartContainerRef.current || !paramMeta) return;

    // Find the actual Recharts SVG — NOT the button icons
    const wrapper = chartContainerRef.current.querySelector(".recharts-wrapper");
    const svg = wrapper
      ? (wrapper.querySelector("svg") as SVGSVGElement | null)
      : (chartContainerRef.current.querySelector(".recharts-surface") as SVGSVGElement | null);
    if (!svg) return;

    setIsDownloading(true);

    const scale = 2;
    const rect = svg.getBoundingClientRect();
    const W = Math.round(rect.width);
    const H = Math.round(rect.height);
    const PAD = 16;
    const HEADER = 60;

    const canvas = document.createElement("canvas");
    canvas.width  = (W + PAD * 2) * scale;
    canvas.height = (H + HEADER + PAD) * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W + PAD * 2, H + HEADER + PAD);

    // Title + subtitle
    const title = `${paramMeta.label}${paramMeta.unit ? ` (${paramMeta.unit})` : ""}`;
    const subtitle = `${chartData.length} sample${chartData.length !== 1 ? "s" : ""}${datasetName ? ` — ${datasetName}` : ""}`;
    ctx.fillStyle = "#111827";
    ctx.font = "bold 15px -apple-system, sans-serif";
    ctx.fillText(title, PAD, 22);
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText(subtitle, PAD, 40);

    // Stats row (right-aligned)
    if (stats) {
      const statsStr = `Min: ${stats.min}  Avg: ${stats.avg}  Max: ${stats.max}  n=${stats.n}`;
      ctx.textAlign = "right";
      ctx.fillText(statsStr, W + PAD, 40);
      ctx.textAlign = "left";
    }

    // Thin divider line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, 50);
    ctx.lineTo(W + PAD, 50);
    ctx.stroke();

    // Serialize the SVG with proper dimensions so the browser renders it at full size
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(W));
    clone.setAttribute("height", String(H));

    // Inline background fill so it isn't transparent
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);

    const svgBlob = new Blob(
      [new XMLSerializer().serializeToString(clone)],
      { type: "image/svg+xml;charset=utf-8" }
    );
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      ctx.drawImage(img, PAD, HEADER, W, H);
      URL.revokeObjectURL(url);

      const fname = `${(datasetName || "dataset").replace(/[^a-zA-Z0-9]/g, "_")}_${paramMeta.label.replace(/[^a-zA-Z0-9]/g, "_")}_${chartType}.png`;
      const a = document.createElement("a");
      a.download = fname;
      a.href = canvas.toDataURL("image/png");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setIsDownloading(false);
    };

    img.onerror = (e) => {
      console.error("SVG render failed", e);
      setIsDownloading(false);
    };

    img.src = url;
  };

  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const vals = chartData.map((d: any) => d.value);
    const avg = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
    return {
      min: Math.min(...vals).toFixed(3),
      max: Math.max(...vals).toFixed(3),
      avg: avg.toFixed(3),
      n: vals.length,
    };
  }, [chartData]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <BarChart2 className="w-4 h-4" />
        Generate Figures
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <BarChart2 className="w-5 h-5 text-primary" />
              Generate Figures
              {datasetName && (
                <Badge variant="secondary" className="ml-1 font-normal">
                  {datasetName}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="pt-2 space-y-5">
            {availableParams.length === 0 ? (
              <div className="py-12 text-center">
                <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-lg">No numeric data yet</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Add samples with numeric fields (temperature, pH, hardness, etc.) to generate figures.
                </p>
              </div>
            ) : (
              <>
                {/* Controls row */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-48 space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Parameter
                    </label>
                    <div className="relative">
                      <select
                        className="w-full h-10 rounded-lg border border-input bg-card px-3 pr-8 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={selectedParam}
                        onChange={(e) => setSelectedParam(e.target.value)}
                      >
                        <option value="">Choose a parameter...</option>
                        {availableParams.map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}{meta.unit ? ` (${meta.unit})` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Chart Type
                    </label>
                    <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-lg p-0.5">
                      {CHART_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setChartType(opt.id)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            chartType === opt.id
                              ? "bg-card text-foreground shadow"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chart */}
                {selectedParam && chartData.length > 0 ? (
                  <div className="bg-muted/30 rounded-2xl p-4 border border-border" ref={chartContainerRef}>
                    <div className="flex items-start justify-between mb-2 gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base">
                          {paramMeta?.label}{paramMeta?.unit ? ` (${paramMeta.unit})` : ""}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {chartData.length} sample{chartData.length !== 1 ? "s" : ""}
                          {datasetName ? ` in ${datasetName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-start gap-4">
                        {stats && (
                          <div className="flex gap-4 text-center text-xs">
                            <div><p className="text-muted-foreground">Min</p><p className="font-semibold">{stats.min}</p></div>
                            <div><p className="text-muted-foreground">Avg</p><p className="font-semibold">{stats.avg}</p></div>
                            <div><p className="text-muted-foreground">Max</p><p className="font-semibold">{stats.max}</p></div>
                            <div><p className="text-muted-foreground">n</p><p className="font-semibold">{stats.n}</p></div>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 shrink-0"
                          onClick={downloadChart}
                          disabled={isDownloading}
                          data-html2canvas-ignore="true"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {isDownloading ? "Saving..." : "Download PNG"}
                        </Button>
                      </div>
                    </div>

                    {chartType === "bar" && (
                      <BarFigure
                        data={chartData}
                        paramLabel={paramMeta?.label ?? ""}
                        paramUnit={paramMeta?.unit ?? ""}
                      />
                    )}
                    {chartType === "scatter" && (
                      <ScatterFigure
                        data={chartData}
                        paramLabel={paramMeta?.label ?? ""}
                        paramUnit={paramMeta?.unit ?? ""}
                      />
                    )}
                    {chartType === "compare" && (
                      <CompareFigure
                        data={chartData}
                        paramLabel={paramMeta?.label ?? ""}
                        paramUnit={paramMeta?.unit ?? ""}
                      />
                    )}

                    {/* Color legend */}
                    <div className="flex gap-4 justify-center mt-3 flex-wrap">
                      {[...new Set(chartData.map((d: any) => d.type))].map((t) => (
                        <div key={t as string} className="flex items-center gap-1.5 text-xs">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[t as string] }} />
                          <span className="text-muted-foreground capitalize">{(t as string).replace("_", "/")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedParam ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    No samples have values for <strong>{paramMeta?.label}</strong> in this dataset.
                  </div>
                ) : (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    Select a parameter above to generate a figure.
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
