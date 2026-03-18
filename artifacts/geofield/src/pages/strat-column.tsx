import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Trash2, GripVertical, Download, ChevronDown, ChevronUp,
  Layers, ArrowLeft, Save, Pencil, X, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/* ── Types ─────────────────────────────────────────────────────────────── */
export interface StratLayer {
  id: string;
  name: string;
  lithology: string;
  color: string;
  thickness: number;       // metres
  age: string;
  formation: string;
  description: string;
}

export interface StrikeDipMeasurement {
  id: string;
  label: string;
  strike: string;   // e.g. "045°"
  dip: string;      // e.g. "30°"
  dipDir: string;   // e.g. "SE"
  notes: string;
}

export interface StratColumn {
  id: string;
  title: string;
  location: string;
  author: string;
  date: string;
  layers: StratLayer[];   // index 0 = top (youngest)
  measurements: StrikeDipMeasurement[];
  createdAt: number;
  updatedAt: number;
}

/* ── localStorage helpers ───────────────────────────────────────────────── */
const STORAGE_KEY = "geofield_strat_columns";

export function loadColumns(): StratColumn[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveColumns(cols: StratColumn[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
  window.dispatchEvent(new Event("strat-columns-updated"));
}

function upsertColumn(col: StratColumn) {
  const all = loadColumns();
  const idx = all.findIndex((c) => c.id === col.id);
  if (idx >= 0) all[idx] = col; else all.unshift(col);
  saveColumns(all);
}

/* ── Lithology catalogue (pattern key + default color) ─────────────────── */
export const LITHOLOGIES: { value: string; label: string; color: string; pattern: string }[] = [
  { value: "sandstone",    label: "Sandstone",          color: "#d4b483", pattern: "dots" },
  { value: "siltstone",   label: "Siltstone",           color: "#c4a97a", pattern: "fine-dots" },
  { value: "shale",       label: "Shale",               color: "#8a9bb0", pattern: "hlines" },
  { value: "mudstone",    label: "Mudstone",            color: "#9b8ea0", pattern: "hlines" },
  { value: "limestone",   label: "Limestone",           color: "#c8d8b0", pattern: "bricks" },
  { value: "dolostone",   label: "Dolostone",           color: "#b8c89a", pattern: "bricks2" },
  { value: "conglomerate",label: "Conglomerate",        color: "#c8a870", pattern: "circles" },
  { value: "breccia",     label: "Breccia",             color: "#bc9860", pattern: "circles" },
  { value: "coal",        label: "Coal",                color: "#2a2a2a", pattern: "solid" },
  { value: "chert",       label: "Chert",               color: "#e8e0c8", pattern: "vlines" },
  { value: "evaporite",   label: "Evaporite",           color: "#f0e8d8", pattern: "xhatch" },
  { value: "basalt",      label: "Basalt / Lava",       color: "#444444", pattern: "lava" },
  { value: "tuff",        label: "Tuff / Ash",          color: "#d0c8b8", pattern: "fine-dots" },
  { value: "granite",     label: "Granite (intrusive)", color: "#e0c8c0", pattern: "crosses" },
  { value: "quartzite",   label: "Quartzite",           color: "#f8f4e8", pattern: "vlines" },
  { value: "schist",      label: "Schist",              color: "#b8b0a0", pattern: "xhatch" },
  { value: "gneiss",      label: "Gneiss",              color: "#c8b8a8", pattern: "xhatch" },
  { value: "slate",       label: "Slate",               color: "#788090", pattern: "hlines" },
  { value: "diamictite",  label: "Diamictite (glacial)",color: "#b8c0c8", pattern: "circles" },
  { value: "peat",        label: "Peat / Organic",      color: "#5a4030", pattern: "peat" },
  { value: "soil",        label: "Soil",                color: "#8B5E3C", pattern: "peat" },
  { value: "sand_loose",  label: "Sand (unconsolidated)",color:"#e8d090", pattern: "dots" },
  { value: "gravel",      label: "Gravel",              color: "#c8b870", pattern: "circles" },
  { value: "clay_sed",    label: "Clay (unconsolidated)",color:"#a89898", pattern: "hlines" },
  { value: "other",       label: "Other / Custom",      color: "#cccccc", pattern: "blank" },
];

const lithoMap = Object.fromEntries(LITHOLOGIES.map((l) => [l.value, l]));

/* ── SVG pattern renderer ───────────────────────────────────────────────── */
function renderPattern(pattern: string, color: string, id: string): string {
  const bg = color;
  const fg = darken(color, 0.35);
  switch (pattern) {
    case "hlines":
      return `<pattern id="${id}" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="8" height="4" fill="${bg}"/><line x1="0" y1="2" x2="8" y2="2" stroke="${fg}" stroke-width="0.8"/></pattern>`;
    case "vlines":
      return `<pattern id="${id}" width="4" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="8" fill="${bg}"/><line x1="2" y1="0" x2="2" y2="8" stroke="${fg}" stroke-width="0.8"/></pattern>`;
    case "dots":
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${bg}"/><circle cx="2" cy="2" r="1.2" fill="${fg}"/><circle cx="6" cy="6" r="1.2" fill="${fg}"/></pattern>`;
    case "fine-dots":
      return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${bg}"/><circle cx="2.5" cy="2.5" r="0.7" fill="${fg}"/></pattern>`;
    case "bricks":
      return `<pattern id="${id}" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="${bg}"/><rect x="0" y="0" width="14" height="3.5" rx="0.5" fill="none" stroke="${fg}" stroke-width="0.7"/><rect x="8" y="4" width="14" height="3.5" rx="0.5" fill="none" stroke="${fg}" stroke-width="0.7"/></pattern>`;
    case "bricks2":
      return `<pattern id="${id}" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="${bg}"/><rect x="0" y="0" width="14" height="3.5" rx="0" fill="none" stroke="${fg}" stroke-width="0.7"/><rect x="8" y="4" width="14" height="3.5" rx="0" fill="none" stroke="${fg}" stroke-width="0.7"/><line x1="7" y1="0" x2="9" y2="3.5" stroke="${fg}" stroke-width="0.5"/></pattern>`;
    case "circles":
      return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${bg}"/><circle cx="5" cy="5" r="3" fill="none" stroke="${fg}" stroke-width="0.8"/></pattern>`;
    case "xhatch":
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${bg}"/><line x1="0" y1="0" x2="8" y2="8" stroke="${fg}" stroke-width="0.7"/><line x1="8" y1="0" x2="0" y2="8" stroke="${fg}" stroke-width="0.7"/></pattern>`;
    case "crosses":
      return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${bg}"/><line x1="5" y1="2" x2="5" y2="8" stroke="${fg}" stroke-width="1"/><line x1="2" y1="5" x2="8" y2="5" stroke="${fg}" stroke-width="1"/></pattern>`;
    case "lava":
      return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${bg}"/><polygon points="5,1 9,9 1,9" fill="none" stroke="${fg}" stroke-width="0.7"/></pattern>`;
    case "peat":
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${bg}"/><line x1="0" y1="4" x2="8" y2="4" stroke="${fg}" stroke-width="0.7" stroke-dasharray="2,2"/></pattern>`;
    case "solid":
      return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${bg}"/></pattern>`;
    default:
      return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${bg}"/></pattern>`;
  }
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = (v: number) => Math.max(0, Math.round(v * (1 - amount))).toString(16).padStart(2, "0");
  return `#${d(r)}${d(g)}${d(b)}`;
}

/* ── Column SVG renderer ────────────────────────────────────────────────── */
const COL_WIDTH = 120;
const LABEL_W   = 160;
const AGE_W     = 90;
const PX_PER_M  = 40;
const MIN_H     = 18;
const MARGIN    = { top: 60, bottom: 20, left: 20, right: 20 };

function buildColumnSvg(column: StratColumn): string {
  const layers = [...column.layers].reverse(); // bottom → top on canvas = oldest at bottom
  const total = layers.reduce((s, l) => s + Math.max(0.1, l.thickness), 0);
  const totalPx = Math.max(total * PX_PER_M, layers.length * MIN_H);
  const svgH = MARGIN.top + totalPx + MARGIN.bottom;
  const svgW = MARGIN.left + AGE_W + COL_WIDTH + LABEL_W + MARGIN.right;

  let y = MARGIN.top;
  const defs: string[] = [];
  const rects: string[] = [];
  const texts: string[] = [];
  const lines: string[] = [];

  // Title
  texts.push(`<text x="${MARGIN.left + AGE_W + COL_WIDTH / 2}" y="20" text-anchor="middle" font-size="14" font-weight="bold" font-family="sans-serif" fill="#111">${esc(column.title || "Stratigraphic Column")}</text>`);
  if (column.location) texts.push(`<text x="${MARGIN.left + AGE_W + COL_WIDTH / 2}" y="36" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#666">${esc(column.location)}</text>`);

  // Column border top
  lines.push(`<line x1="${MARGIN.left + AGE_W}" y1="${MARGIN.top}" x2="${MARGIN.left + AGE_W + COL_WIDTH}" y2="${MARGIN.top}" stroke="#333" stroke-width="1.5"/>`);

  // Header labels
  texts.push(`<text x="${MARGIN.left + AGE_W / 2}" y="${MARGIN.top - 8}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="#555" font-weight="bold">AGE / UNIT</text>`);
  texts.push(`<text x="${MARGIN.left + AGE_W + COL_WIDTH / 2}" y="${MARGIN.top - 8}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="#555" font-weight="bold">LITHOLOGY</text>`);
  texts.push(`<text x="${MARGIN.left + AGE_W + COL_WIDTH + 8}" y="${MARGIN.top - 8}" text-anchor="start" font-size="9" font-family="sans-serif" fill="#555" font-weight="bold">DESCRIPTION</text>`);

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const lith = lithoMap[layer.lithology] ?? lithoMap["other"];
    const frac = Math.max(0.1, layer.thickness) / total;
    const h = Math.max(MIN_H, frac * totalPx);
    const patId = `pat_${i}`;
    const col = layer.color || lith.color;

    defs.push(renderPattern(lith.pattern, col, patId));

    const cx = MARGIN.left + AGE_W;
    const ly = y;

    // Pattern rect
    rects.push(`<rect x="${cx}" y="${ly}" width="${COL_WIDTH}" height="${h}" fill="url(#${patId})" stroke="#444" stroke-width="0.8"/>`);

    // Thickness label (right inside column)
    if (h >= 14) {
      texts.push(`<text x="${cx + COL_WIDTH - 4}" y="${ly + h / 2 + 3}" text-anchor="end" font-size="8" font-family="sans-serif" fill="#333">${layer.thickness.toFixed(1)}m</text>`);
    }

    // Age / formation (left column)
    if (layer.age || layer.formation) {
      const ageText = [layer.age, layer.formation].filter(Boolean).join(" · ");
      texts.push(`<text x="${MARGIN.left + AGE_W - 6}" y="${ly + h / 2 + 3}" text-anchor="end" font-size="8" font-family="sans-serif" fill="#444">${esc(ageText)}</text>`);
    }

    // Description label (right)
    const descParts: string[] = [];
    if (layer.name) descParts.push(layer.name);
    descParts.push(lith.label);
    if (layer.description) descParts.push(layer.description);
    const desc = descParts.join(" — ");
    const maxChars = 28;
    const displayDesc = desc.length > maxChars ? desc.slice(0, maxChars) + "…" : desc;
    texts.push(`<text x="${cx + COL_WIDTH + 8}" y="${ly + h / 2 + 3}" text-anchor="start" font-size="9" font-family="sans-serif" fill="#222">${esc(displayDesc)}</text>`);

    // Tick line
    lines.push(`<line x1="${cx - 6}" y1="${ly}" x2="${cx}" y2="${ly}" stroke="#555" stroke-width="0.8"/>`);

    y += h;
  }

  // Column border sides + bottom
  lines.push(`<line x1="${MARGIN.left + AGE_W}" y1="${MARGIN.top}" x2="${MARGIN.left + AGE_W}" y2="${y}" stroke="#333" stroke-width="1.5"/>`);
  lines.push(`<line x1="${MARGIN.left + AGE_W + COL_WIDTH}" y1="${MARGIN.top}" x2="${MARGIN.left + AGE_W + COL_WIDTH}" y2="${y}" stroke="#333" stroke-width="1.5"/>`);
  lines.push(`<line x1="${MARGIN.left + AGE_W}" y1="${y}" x2="${MARGIN.left + AGE_W + COL_WIDTH}" y2="${y}" stroke="#333" stroke-width="1.5"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
  <defs>${defs.join("")}</defs>
  <rect width="${svgW}" height="${svgH}" fill="white"/>
  ${lines.join("\n  ")}
  ${rects.join("\n  ")}
  ${texts.join("\n  ")}
</svg>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── Live SVG preview component ─────────────────────────────────────────── */
function ColumnPreview({ column }: { column: StratColumn }) {
  if (column.layers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 py-16">
        <Layers className="w-12 h-12 opacity-20" />
        <p className="text-sm">Add layers on the left to build the column.</p>
      </div>
    );
  }
  const svg = buildColumnSvg(column);
  return (
    <div className="flex-1 overflow-auto bg-white rounded-xl border shadow-inner p-4">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

/* ── Layer editor row ───────────────────────────────────────────────────── */
const newLayer = (): StratLayer => ({
  id: crypto.randomUUID(),
  name: "",
  lithology: "sandstone",
  color: "#d4b483",
  thickness: 1,
  age: "",
  formation: "",
  description: "",
});

function LayerRow({
  layer, index, total,
  onChange, onDelete, onMoveUp, onMoveDown,
}: {
  layer: StratLayer; index: number; total: number;
  onChange: (l: StratLayer) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(false);
  const lith = lithoMap[layer.lithology] ?? lithoMap["other"];

  const upd = (k: keyof StratLayer, v: any) => onChange({ ...layer, [k]: v });

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={index === 0} className="disabled:opacity-20 hover:text-primary p-0.5 leading-none">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="disabled:opacity-20 hover:text-primary p-0.5 leading-none">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* color swatch */}
        <div className="w-5 h-5 rounded border shrink-0" style={{ background: layer.color || lith.color }} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{layer.name || lith.label}</p>
          <p className="text-xs text-muted-foreground truncate">{layer.thickness}m · {lith.label}</p>
        </div>

        <button onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover:bg-muted transition-colors">
          {open ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        </button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded editor */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30 grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Layer Label</Label>
            <Input value={layer.name} onChange={(e) => upd("name", e.target.value)} placeholder="e.g. Upper Sandstone Member" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lithology</Label>
            <select
              className="flex h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
              value={layer.lithology}
              onChange={(e) => {
                const l = lithoMap[e.target.value] ?? lithoMap["other"];
                onChange({ ...layer, lithology: e.target.value, color: l.color });
              }}
            >
              {LITHOLOGIES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Color override</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={layer.color || lith.color} onChange={(e) => upd("color", e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
              <Input value={layer.color} onChange={(e) => upd("color", e.target.value)} className="h-8 text-sm flex-1" placeholder="#d4b483" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Thickness (m)</Label>
            <Input type="number" step="0.1" min="0.1" value={layer.thickness} onChange={(e) => upd("thickness", parseFloat(e.target.value) || 0.1)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Geologic Age</Label>
            <Input value={layer.age} onChange={(e) => upd("age", e.target.value)} placeholder="e.g. Cretaceous" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Formation / Unit</Label>
            <Input value={layer.formation} onChange={(e) => upd("formation", e.target.value)} placeholder="e.g. Morrison Fm." className="h-8 text-sm" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={layer.description} onChange={(e) => upd("description", e.target.value)} placeholder="Sedimentary structures, fossils, contacts…" className="text-sm min-h-16 resize-none" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function StratColumnPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isNew = id === "new";

  const [column, setColumn] = useState<StratColumn>(() => {
    if (!isNew) {
      const found = loadColumns().find((c) => c.id === id);
      // backwards-compat: older saved columns won't have measurements
      if (found) return { measurements: [], ...found };
    }
    return {
      id: crypto.randomUUID(),
      title: "",
      location: "",
      author: "",
      date: new Date().toISOString().slice(0, 10),
      layers: [],
      measurements: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  const [saved, setSaved] = useState(!isNew);

  const save = useCallback(() => {
    const updated = { ...column, updatedAt: Date.now() };
    upsertColumn(updated);
    setColumn(updated);
    setSaved(true);
    toast({ title: "Column saved" });
    if (isNew) setLocation(`/strat/${updated.id}`, { replace: true });
  }, [column, isNew, setLocation, toast]);

  // Auto-save on change after first save
  const firstSave = useRef(isNew ? false : true);
  useEffect(() => {
    if (!firstSave.current) return;
    const t = setTimeout(() => {
      upsertColumn({ ...column, updatedAt: Date.now() });
    }, 1500);
    return () => clearTimeout(t);
  }, [column]);

  const addLayer = () => {
    const l = newLayer();
    setColumn((c) => ({ ...c, layers: [...c.layers, l] }));
    if (firstSave.current) setSaved(false);
  };

  const updateLayer = (idx: number, l: StratLayer) => {
    setColumn((c) => {
      const layers = [...c.layers];
      layers[idx] = l;
      return { ...c, layers };
    });
    setSaved(false);
  };

  const deleteLayer = (idx: number) => {
    setColumn((c) => ({ ...c, layers: c.layers.filter((_, i) => i !== idx) }));
    setSaved(false);
  };

  const moveLayer = (idx: number, dir: -1 | 1) => {
    setColumn((c) => {
      const layers = [...c.layers];
      const swap = idx + dir;
      if (swap < 0 || swap >= layers.length) return c;
      [layers[idx], layers[swap]] = [layers[swap], layers[idx]];
      return { ...c, layers };
    });
    setSaved(false);
  };

  const exportPng = async () => {
    if (column.layers.length === 0) {
      toast({ title: "Nothing to export", description: "Add at least one layer first.", variant: "destructive" });
      return;
    }
    const svg = buildColumnSvg(column);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${(column.title || "strat-column").replace(/\s+/g, "_")}.png`;
        a.click();
      }, "image/png");
    };
    img.src = url;
  };

  const exportSvg = () => {
    if (column.layers.length === 0) return;
    const svg = buildColumnSvg(column);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(column.title || "strat-column").replace(/\s+/g, "_")}.svg`;
    a.click();
  };

  const upd = (k: keyof StratColumn, v: any) => {
    setColumn((c) => ({ ...c, [k]: v }));
    setSaved(false);
    firstSave.current = true;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <Input
              value={column.title}
              onChange={(e) => upd("title", e.target.value)}
              placeholder="Column title…"
              className="text-lg font-semibold h-10 border-transparent hover:border-input focus:border-input bg-transparent px-2"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={exportSvg} className="gap-1.5 hidden sm:flex">
              <Download className="w-3.5 h-3.5" />
              SVG
            </Button>
            <Button variant="outline" size="sm" onClick={exportPng} className="gap-1.5">
              <Download className="w-3.5 h-3.5" />
              PNG
            </Button>
            <Button size="sm" onClick={save} className={cn("gap-1.5", saved && "bg-green-600 hover:bg-green-700")}>
              {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>

        {/* Metadata strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Location / Outcrop</Label>
            <Input value={column.location} onChange={(e) => upd("location", e.target.value)} placeholder="e.g. Sheep Creek, WY" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Author</Label>
            <Input value={column.author} onChange={(e) => upd("author", e.target.value)} placeholder="Your name" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={column.date} onChange={(e) => upd("date", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Total thickness</Label>
            <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-sm font-mono">
              {column.layers.reduce((s, l) => s + Math.max(0, l.thickness), 0).toFixed(1)} m
            </div>
          </div>
        </div>

        {/* Main two-panel layout */}
        <div className="flex gap-4 flex-1 min-h-0 flex-col lg:flex-row">
          {/* Left — layer list */}
          <div className="lg:w-72 xl:w-80 flex flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Layers <span className="font-normal">({column.layers.length})</span>
              </h2>
              <span className="text-xs text-muted-foreground">↑ youngest · oldest ↓</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {column.layers.map((layer, idx) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  index={idx}
                  total={column.layers.length}
                  onChange={(l) => updateLayer(idx, l)}
                  onDelete={() => deleteLayer(idx)}
                  onMoveUp={() => moveLayer(idx, -1)}
                  onMoveDown={() => moveLayer(idx, 1)}
                />
              ))}
            </div>

            <Button variant="outline" onClick={addLayer} className="gap-2 w-full">
              <Plus className="w-4 h-4" />
              Add Layer
            </Button>
          </div>

          {/* Centre — preview */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Preview</h2>
              <span className="text-xs text-muted-foreground">Youngest at top</span>
            </div>
            <ColumnPreview column={column} />
          </div>

        </div>
      </div>
    </Layout>
  );
}
