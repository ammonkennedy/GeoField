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
  ReferenceLine,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { BarChart2, ChevronDown, Download } from "lucide-react";
import type { Sample } from "@workspace/api-client-react";
import { saveFile } from "@/lib/save-file";

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
  ambientTemperature: { label: "Ambient Temp",    unit: "°C",     type: "air" },
  relativeHumidity: { label: "Relative Humidity", unit: "%",      type: "air" },
};

const TYPE_COLORS: Record<string, string> = {
  water:     "#2d7dd2",
  rock:      "#8b5e3c",
  soil_sand: "#c49a3c",
  air:       "#64748b",
};

type ChartType = "bar" | "scatter" | "box";

const CHART_OPTIONS: { id: ChartType; label: string }[] = [
  { id: "bar", label: "Bar Chart" },
  { id: "scatter", label: "Scatter Plot" },
  { id: "box", label: "Box Plot" },
];

function FigureViewport({ data, children }: { data: any[]; children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div style={{ width: Math.max(640, data.length * 72), height: 360 }}>{children}</div>
    </div>
  );
}

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
    <FigureViewport data={data}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 28, right: 24, left: 20, bottom: 76 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          angle={-40}
          textAnchor="end"
          interval={0}
          height={76}
        />
        <YAxis tick={{ fontSize: 11 }} width={58} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={data.reduce((s, d) => s + d.value, 0) / (data.length || 1)}
          stroke="#888"
          strokeDasharray="4 4"
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={TYPE_COLORS[d.type] || "#8884d8"} opacity={0.85} />
          ))}
          <LabelList dataKey="value" position="top" style={{ fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </FigureViewport>
  );
}

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg">
      <p className="font-semibold">{point?.name}</p>
      <p className="text-muted-foreground">{point?.xLabel}: <strong>{point?.x}</strong>{point?.xUnit ? ` ${point.xUnit}` : ""}</p>
      <p className="text-muted-foreground">{point?.yLabel}: <strong>{point?.value}</strong>{point?.unit ? ` ${point.unit}` : ""}</p>
    </div>
  );
}

function ScatterFigure({ data, xLabel, yLabel }: { data: any[]; xLabel: string; yLabel: string }) {
  return (
    <FigureViewport data={data}>
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 28, right: 24, left: 28, bottom: 44 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="x" name={xLabel} type="number" tick={{ fontSize: 11 }} height={48} label={{ value: xLabel, position: "insideBottom", offset: 0 }} />
        <YAxis dataKey="value" name={yLabel} type="number" tick={{ fontSize: 11 }} width={66} label={{ value: yLabel, angle: -90, position: "insideLeft" }} />
        <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={data}>
          {data.map((d, i) => (
            <Cell key={i} fill={TYPE_COLORS[d.type] || "#8884d8"} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
    </FigureViewport>
  );
}

function quantile(sorted: number[], percentile: number) {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower] + ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * fraction;
}

function BoxFigure({ data, paramLabel, paramUnit }: { data: any[]; paramLabel: string; paramUnit: string }) {
  const types = [...new Set(data.map((item) => item.type))];
  const groups = [
    { label: "All Samples", values: data.map((item) => item.value) },
    ...types.map((type) => ({
      label: String(type).replace("_", "/"),
      values: data.filter((item) => item.type === type).map((item) => item.value),
    })),
  ].map((group) => {
    const values = [...group.values].sort((a, b) => a - b);
    return {
      ...group,
      min: values[0],
      q1: quantile(values, 0.25),
      median: quantile(values, 0.5),
      q3: quantile(values, 0.75),
      max: values[values.length - 1],
    };
  });
  const values = data.map((item) => item.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || 1;
  const domainMin = minValue - span * 0.08;
  const domainMax = maxValue + span * 0.08;
  const width = Math.max(640, groups.length * 150);
  const height = 360;
  const plot = { left: 76, right: 24, top: 24, bottom: 64 };
  const y = (value: number) => plot.top + ((domainMax - value) / (domainMax - domainMin)) * (height - plot.top - plot.bottom);
  const ticks = Array.from({ length: 6 }, (_, index) => domainMin + (domainMax - domainMin) * index / 5);

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="recharts-wrapper" style={{ width, height }}>
        <svg className="recharts-surface" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={plot.left} x2={width - plot.right} y1={y(tick)} y2={y(tick)} stroke="#d1d5db" strokeDasharray="3 3" />
              <text x={plot.left - 9} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{Number(tick.toPrecision(4))}</text>
            </g>
          ))}
          <text x={15} y={height / 2} transform={`rotate(-90 15 ${height / 2})`} textAnchor="middle" fontSize="12" fill="#4b5563">
            {paramLabel}{paramUnit ? ` (${paramUnit})` : ""}
          </text>
          {groups.map((group, index) => {
            const x = plot.left + (index + 0.5) * (width - plot.left - plot.right) / groups.length;
            const color = index === 0 ? "#64748b" : TYPE_COLORS[types[index - 1]] || "#8884d8";
            return (
              <g key={group.label}>
                <line x1={x} x2={x} y1={y(group.max)} y2={y(group.min)} stroke={color} strokeWidth="2" />
                <line x1={x - 18} x2={x + 18} y1={y(group.max)} y2={y(group.max)} stroke={color} strokeWidth="2" />
                <line x1={x - 18} x2={x + 18} y1={y(group.min)} y2={y(group.min)} stroke={color} strokeWidth="2" />
                <rect x={x - 30} y={y(group.q3)} width="60" height={Math.max(1, y(group.q1) - y(group.q3))} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" rx="3" />
                <line x1={x - 30} x2={x + 30} y1={y(group.median)} y2={y(group.median)} stroke={color} strokeWidth="3" />
                <text x={x} y={height - 35} textAnchor="middle" fontSize="11" fill="#374151" style={{ textTransform: "capitalize" }}>{group.label}</text>
                <text x={x} y={height - 18} textAnchor="middle" fontSize="10" fill="#6b7280">n={group.values.length}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function DatasetFigures({ samples, datasetName }: { samples: Sample[]; datasetName?: string }) {
  const [open, setOpen] = useState(false);
  const [selectedParam, setSelectedParam] = useState<string>("");
  const [scatterXParam, setScatterXParam] = useState<string>("");
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
  const scatterXMeta = scatterXParam ? NUMERIC_PARAMS[scatterXParam] : null;
  const scatterData = useMemo(() => {
    if (!selectedParam || !scatterXParam) return [];
    return samples.flatMap((sample) => {
      const x = Number((sample.fields as any)?.[scatterXParam]);
      const value = Number((sample.fields as any)?.[selectedParam]);
      if (!Number.isFinite(x) || !Number.isFinite(value)) return [];
      return [{
        name: sample.sampleId,
        x,
        value,
        type: sample.sampleType,
        xLabel: scatterXMeta?.label,
        xUnit: scatterXMeta?.unit,
        yLabel: paramMeta?.label,
        unit: paramMeta?.unit,
      }];
    });
  }, [samples, selectedParam, scatterXParam, scatterXMeta, paramMeta]);

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
    const HEADER = 88;

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
    ctx.font = "bold 16px -apple-system, sans-serif";
    ctx.fillText(title, PAD, 24, W);
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText(subtitle, PAD, 46, W);

    // Stats row (right-aligned)
    if (stats) {
      const statsStr = `Min: ${stats.min}  Avg: ${stats.avg}  Max: ${stats.max}  n=${stats.n}`;
      ctx.fillText(statsStr, PAD, 67, W);
    }

    // Thin divider line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, 76);
    ctx.lineTo(W + PAD, 76);
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

    img.onload = async () => {
      ctx.drawImage(img, PAD, HEADER, W, H);
      URL.revokeObjectURL(url);

      const fname = `${(datasetName || "dataset").replace(/[^a-zA-Z0-9]/g, "_")}_${paramMeta.label.replace(/[^a-zA-Z0-9]/g, "_")}_${chartType}.png`;
      try {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create the PNG image.")), "image/png")
        );
        await saveFile(blob, fname);
      } catch (error: any) {
        if (error?.name !== "AbortError") console.error("Chart export failed", error);
      } finally {
        setIsDownloading(false);
      }
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

      <Dialog open={open} onOpenChange={setOpen} panelClassName="max-w-5xl">
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

                  {chartType === "scatter" && (
                    <div className="flex-1 min-w-48 space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">X-axis Parameter</label>
                      <div className="relative">
                        <select
                          className="w-full h-10 rounded-lg border border-input bg-card px-3 pr-8 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={scatterXParam}
                          onChange={(event) => setScatterXParam(event.target.value)}
                        >
                          <option value="">Choose an X-axis parameter...</option>
                          {availableParams.filter(([key]) => key !== selectedParam).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}{meta.unit ? ` (${meta.unit})` : ""}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  )}

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
                    <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-semibold leading-tight">
                          {paramMeta?.label}{paramMeta?.unit ? ` (${paramMeta.unit})` : ""}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {chartData.length} sample{chartData.length !== 1 ? "s" : ""}
                          {datasetName ? ` in ${datasetName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-start gap-4">
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
                      scatterXParam && scatterData.length > 0
                        ? <ScatterFigure data={scatterData} xLabel={`${scatterXMeta?.label ?? ""}${scatterXMeta?.unit ? ` (${scatterXMeta.unit})` : ""}`} yLabel={`${paramMeta?.label ?? ""}${paramMeta?.unit ? ` (${paramMeta.unit})` : ""}`} />
                        : <div className="py-16 text-center text-sm text-muted-foreground">{scatterXParam ? "No samples contain values for both selected parameters." : "Choose an X-axis parameter to generate the scatter plot."}</div>
                    )}
                    {chartType === "box" && (
                      <BoxFigure
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
