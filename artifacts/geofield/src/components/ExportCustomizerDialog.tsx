import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Download, ChevronUp, ChevronDown, GripVertical,
  Eye, EyeOff, RotateCcw, TableProperties, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ExportColumn, type ExportFormatConfig,
  HEADER_COLOR_PRESETS, ZEBRA_COLOR_PRESETS,
  saveExportConfig, saveColumnPrefs,
} from "@/lib/export-config";

/* ─── Props ──────────────────────────────────────────────────────────────── */
interface ExportCustomizerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  initialColumns: ExportColumn[];
  initialConfig: ExportFormatConfig;
  configKey: string;
  exportLabel?: string;
  onExport: (columns: ExportColumn[], config: ExportFormatConfig) => void;
}

/* ─── Tab type ───────────────────────────────────────────────────────────── */
type Tab = "columns" | "format";

/* ─── Color swatch ───────────────────────────────────────────────────────── */
function ColorSwatch({
  hex, active, onClick, title,
}: { hex: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "w-8 h-8 rounded-lg border-2 transition-all",
        active ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105 hover:border-border"
      )}
      style={{ backgroundColor: `#${hex}` }}
    />
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function ExportCustomizerDialog({
  open, onOpenChange, title, subtitle,
  initialColumns, initialConfig, configKey, exportLabel, onExport,
}: ExportCustomizerDialogProps) {
  const [tab, setTab] = useState<Tab>("columns");
  const [columns, setColumns] = useState<ExportColumn[]>(initialColumns);
  const [config, setConfig] = useState<ExportFormatConfig>(initialConfig);

  // Reset when dialog opens with new initial values
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setColumns(initialColumns);
      setConfig(initialConfig);
      setTab("columns");
    }
    onOpenChange(v);
  };

  /* ── Column helpers ─────────────────────────────────────────────────── */
  const moveUp = (i: number) => {
    if (i === 0) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };
  const moveDown = (i: number) => {
    setColumns((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };
  const toggleCol = (i: number) =>
    setColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, enabled: !c.enabled } : c)));
  const setLabel = (i: number, label: string) =>
    setColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, label } : c)));
  const enableAll = () => setColumns((prev) => prev.map((c) => ({ ...c, enabled: true })));
  const disableAll = () => setColumns((prev) => prev.map((c) => ({ ...c, enabled: false })));
  const resetOrder = useCallback(() => setColumns(initialColumns), [initialColumns]);

  /* ── Format helpers ─────────────────────────────────────────────────── */
  const setFmt = <K extends keyof ExportFormatConfig>(k: K, v: ExportFormatConfig[K]) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  /* ── Export ─────────────────────────────────────────────────────────── */
  const handleExport = () => {
    saveColumnPrefs(configKey, columns);
    saveExportConfig(configKey, config);
    onExport(columns, config);
    onOpenChange(false);
  };

  const enabledCount = columns.filter((c) => c.enabled).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Download className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b shrink-0 px-6">
          {(["columns", "format"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "columns" ? (
                <><TableProperties className="w-4 h-4" /> Columns</>
              ) : (
                <><Palette className="w-4 h-4" /> Formatting</>
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center pr-1">
            <span className="text-xs text-muted-foreground">
              {enabledCount} / {columns.length} columns selected
            </span>
          </div>
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Columns tab ── */}
          {tab === "columns" && (
            <div className="p-6 space-y-4">
              {/* Bulk actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={enableAll} className="h-7 text-xs">
                  <Eye className="w-3.5 h-3.5 mr-1" /> Enable all
                </Button>
                <Button variant="outline" size="sm" onClick={disableAll} className="h-7 text-xs">
                  <EyeOff className="w-3.5 h-3.5 mr-1" /> Disable all
                </Button>
                <Button variant="outline" size="sm" onClick={resetOrder} className="h-7 text-xs">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset order
                </Button>
                <p className="text-xs text-muted-foreground ml-auto hidden sm:block">
                  Use ↑↓ to reorder · click label to rename
                </p>
              </div>

              {/* Column list */}
              <div className="space-y-1.5">
                {columns.map((col, i) => (
                  <div
                    key={col.key}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                      col.enabled
                        ? "bg-card border-border"
                        : "bg-muted/40 border-dashed border-border/50 opacity-60"
                    )}
                  >
                    {/* Drag handle (visual only) */}
                    <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />

                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleCol(i)}
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                        col.enabled
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border bg-background"
                      )}
                      title={col.enabled ? "Hide column" : "Show column"}
                    >
                      {col.enabled && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    {/* Editable label */}
                    <input
                      value={col.label}
                      onChange={(e) => setLabel(i, e.target.value)}
                      className="flex-1 text-sm bg-transparent border-0 outline-none focus:bg-muted/50 rounded px-1.5 py-0.5 transition-colors min-w-0"
                      placeholder="Column header…"
                    />

                    {/* Up / Down */}
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        onClick={() => moveUp(i)}
                        disabled={i === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveDown(i)}
                        disabled={i === columns.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Move down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Formatting tab ── */}
          {tab === "format" && (
            <div className="p-6 space-y-6">
              {/* Sheet name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sheet Name
                </Label>
                <Input
                  value={config.sheetName}
                  onChange={(e) => setFmt("sheetName", e.target.value)}
                  placeholder="Data"
                  className="h-9 max-w-xs"
                />
              </div>

              {/* Header style */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Header Row Style
                </Label>
                <div className="space-y-3 pl-1">
                  {/* Bold toggle */}
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setFmt("headerBold", !config.headerBold)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative shrink-0",
                        config.headerBold ? "bg-primary" : "bg-border"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        config.headerBold ? "translate-x-5" : "translate-x-0.5"
                      )} />
                    </div>
                    <span className="text-sm">Bold header text</span>
                  </label>

                  {/* Bg color presets */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Background color</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      {HEADER_COLOR_PRESETS.map((p) => (
                        <ColorSwatch
                          key={p.hex}
                          hex={p.hex}
                          title={p.name}
                          active={config.headerBgColor.toLowerCase() === p.hex}
                          onClick={() => setFmt("headerBgColor", p.hex)}
                        />
                      ))}
                      {/* No fill option */}
                      <ColorSwatch
                        hex="FFFFFF"
                        title="No fill"
                        active={config.headerBgColor.toUpperCase() === "FFFFFF"}
                        onClick={() => { setFmt("headerBgColor", "FFFFFF"); setFmt("headerTextLight", false); }}
                      />
                      {/* Custom */}
                      <label
                        className="w-8 h-8 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                        title="Custom color"
                      >
                        <input
                          type="color"
                          value={`#${config.headerBgColor}`}
                          onChange={(e) => setFmt("headerBgColor", e.target.value.replace("#", ""))}
                          className="sr-only"
                        />
                        <span className="text-xs text-muted-foreground font-mono">#</span>
                      </label>
                      <span className="text-xs font-mono text-muted-foreground">#{config.headerBgColor}</span>
                    </div>
                  </div>

                  {/* Text color */}
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setFmt("headerTextLight", !config.headerTextLight)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative shrink-0",
                        config.headerTextLight ? "bg-primary" : "bg-border"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        config.headerTextLight ? "translate-x-5" : "translate-x-0.5"
                      )} />
                    </div>
                    <span className="text-sm">White header text {!config.headerTextLight && "(using dark text)"}</span>
                  </label>

                  {/* Preview swatch */}
                  <div
                    className="inline-flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{
                      backgroundColor: `#${config.headerBgColor}`,
                      color: config.headerTextLight ? "#ffffff" : "#111111",
                      fontWeight: config.headerBold ? 700 : 400,
                      borderColor: `#${config.headerBgColor}`,
                    }}
                  >
                    Sample ID · Location · Notes
                  </div>
                </div>
              </div>

              {/* Zebra stripe */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Row Striping
                </Label>
                <div className="space-y-3 pl-1">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setFmt("zebraStripe", !config.zebraStripe)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative shrink-0",
                        config.zebraStripe ? "bg-primary" : "bg-border"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        config.zebraStripe ? "translate-x-5" : "translate-x-0.5"
                      )} />
                    </div>
                    <span className="text-sm">Alternate row shading (zebra stripe)</span>
                  </label>

                  {config.zebraStripe && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Stripe color</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        {ZEBRA_COLOR_PRESETS.map((p) => (
                          <ColorSwatch
                            key={p.hex}
                            hex={p.hex}
                            title={p.name}
                            active={config.zebraColor.toUpperCase() === p.hex}
                            onClick={() => setFmt("zebraColor", p.hex)}
                          />
                        ))}
                        <label
                          className="w-8 h-8 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                          title="Custom color"
                        >
                          <input
                            type="color"
                            value={`#${config.zebraColor}`}
                            onChange={(e) => setFmt("zebraColor", e.target.value.replace("#", ""))}
                            className="sr-only"
                          />
                          <span className="text-xs text-muted-foreground font-mono">#</span>
                        </label>
                        <span className="text-xs font-mono text-muted-foreground">#{config.zebraColor}</span>
                      </div>
                    </div>
                  )}

                  {/* Row preview */}
                  <div className="rounded-lg overflow-hidden border text-xs font-mono">
                    <div
                      className="px-3 py-1.5"
                      style={{ backgroundColor: `#${config.headerBgColor}`, color: config.headerTextLight ? "#fff" : "#111", fontWeight: config.headerBold ? 700 : 400 }}
                    >
                      Sample ID · Location · Notes
                    </div>
                    <div className="px-3 py-1.5 bg-white text-foreground">GF-001 · 40.7128°N · Quartz vein</div>
                    {config.zebraStripe && (
                      <div className="px-3 py-1.5 text-foreground" style={{ backgroundColor: `#${config.zebraColor}` }}>
                        GF-002 · 40.7130°N · Basalt intrusion
                      </div>
                    )}
                    <div className="px-3 py-1.5 bg-white text-foreground">GF-003 · 40.7135°N · Limestone</div>
                  </div>
                </div>
              </div>

              {/* Layout */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Layout
                </Label>
                <div className="pl-1">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setFmt("freezeHeader", !config.freezeHeader)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative shrink-0",
                        config.freezeHeader ? "bg-primary" : "bg-border"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        config.freezeHeader ? "translate-x-5" : "translate-x-0.5"
                      )} />
                    </div>
                    <span className="text-sm">Freeze header row (keeps header visible when scrolling)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-3 bg-card">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Settings are saved for next time.
          </p>
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={enabledCount === 0}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {exportLabel ?? "Export"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
