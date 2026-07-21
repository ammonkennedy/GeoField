import { useState, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Download, GripVertical, RotateCcw, Plus, Trash2, ArrowLeftRight, ChevronDown, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ExportColumn, type ExportFormatConfig, type ExportCustomRow,
  DEFAULT_FORMAT_CONFIG,
  saveExportConfig, saveColumnPrefs,
} from "@/lib/export-config";

export interface ExportSheetGroup {
  key: string;
  label: string;
  count: number;
  columns: ExportColumn[];
}

interface ExportCustomizerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  initialColumns: ExportColumn[];
  initialGroups?: ExportSheetGroup[];
  trailingSheets?: { label: string; count: number }[];
  initialConfig: ExportFormatConfig;
  configKey: string;
  exportLabel?: string;
  onExport?: (columns: ExportColumn[], config: ExportFormatConfig) => void | Promise<void>;
  onExportGroups?: (groups: ExportSheetGroup[], config: ExportFormatConfig) => void | Promise<void>;
}

function newCustomRow(): ExportCustomRow {
  return { id: `row_${Date.now()}_${Math.random().toString(36).slice(2)}`, text: "" };
}

export function ExportCustomizerDialog({
  open, onOpenChange, title, subtitle,
  initialColumns, initialGroups = [], trailingSheets = [], initialConfig, configKey, exportLabel, onExport, onExportGroups,
}: ExportCustomizerDialogProps) {
  const [columns, setColumns] = useState<ExportColumn[]>(initialColumns);
  const [groups, setGroups] = useState<ExportSheetGroup[]>(initialGroups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(initialGroups.slice(0, 1).map((group) => group.key)));
  const grouped = initialGroups.length > 0;
  const [sheetName, setSheetName] = useState(initialConfig.sheetName);
  const [orientation, setOrientation] = useState<ExportFormatConfig["orientation"]>(initialConfig.orientation || "normal");
  const [customRows, setCustomRows] = useState<ExportCustomRow[]>(initialConfig.customRows || []);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setColumns(initialColumns);
      setGroups(initialGroups);
      setOpenGroups(new Set(initialGroups.slice(0, 1).map((group) => group.key)));
      setSheetName(initialConfig.sheetName);
      setOrientation(initialConfig.orientation || "normal");
      setCustomRows(initialConfig.customRows || []);
    }
    onOpenChange(v);
  };

  const moveColumn = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setColumns((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const startColumnDrag = (event: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    setDragOverIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columns[index]?.key ?? String(index));
  };

  const enterColumnDrag = (index: number) => {
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    moveColumn(from, index);
    dragIndexRef.current = index;
    setDragOverIndex(index);
  };

  const endColumnDrag = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const toggleCol = (i: number) =>
    setColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, enabled: !c.enabled } : c)));

  const setLabel = (i: number, label: string) =>
    setColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, label } : c)));

  const addCustomRow = () => setCustomRows((prev) => [...prev, newCustomRow()]);
  const updateCustomRow = (id: string, text: string) =>
    setCustomRows((prev) => prev.map((row) => (row.id === id ? { ...row, text } : row)));
  const removeCustomRow = (id: string) =>
    setCustomRows((prev) => prev.filter((row) => row.id !== id));

  const enableAll = () => setColumns((prev) => prev.map((c) => ({ ...c, enabled: true })));
  const disableAll = () => setColumns((prev) => prev.map((c) => ({ ...c, enabled: false })));
  const resetOrder = useCallback(() => setColumns(initialColumns), [initialColumns]);

  const updateGroupColumns = (groupKey: string, update: (columns: ExportColumn[]) => ExportColumn[]) =>
    setGroups((current) => current.map((group) => group.key === groupKey ? { ...group, columns: update(group.columns) } : group));

  const handleExport = async () => {
    const config: ExportFormatConfig = {
      ...DEFAULT_FORMAT_CONFIG,
      ...initialConfig,
      sheetName: sheetName || "Data",
      orientation,
      customRows,
    };
    if (grouped) groups.forEach((group) => saveColumnPrefs(`${configKey}-${group.key}`, group.columns));
    else saveColumnPrefs(configKey, columns);
    saveExportConfig(configKey, config);
    setIsExporting(true);
    setExportError("");
    try {
      if (grouped && onExportGroups) await onExportGroups(groups, config);
      else if (onExport) await onExport(columns, config);
      onOpenChange(false);
    } catch (error: any) {
      // Canceling the iOS share sheet is not an export failure.
      if (error?.name !== "AbortError") setExportError(error?.message || "The file could not be exported.");
    } finally {
      setIsExporting(false);
    }
  };

  const enabledCount = grouped
    ? groups.reduce((count, group) => count + group.columns.filter((column) => column.enabled).length, 0)
    : columns.filter((c) => c.enabled).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Download className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Sheet name */}
          {!grouped && <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sheet Name
            </Label>
            <Input
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Data"
              className="h-9 max-w-xs"
            />
          </div>}

          {/* Orientation */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Spreadsheet Layout
            </Label>
            <button
              type="button"
              onClick={() => setOrientation((current) => current === "normal" ? "transposed" : "normal")}
              className={cn(
                "w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                orientation === "transposed"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-3">
                <ArrowLeftRight className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {orientation === "normal" ? "Records as rows" : "Parameters as rows"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {orientation === "normal"
                      ? "Each sample or measurement is one row. Press to flip."
                      : "Each parameter is one row, with records across columns. Press to flip back."}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium rounded-full bg-muted px-2 py-1 text-muted-foreground">
                Flip
              </span>
            </button>
          </div>

          {/* Custom rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Extra Rows Above Header
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Add blank spacing rows or type a title that appears above the Excel headers.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" onClick={addCustomRow}>
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </Button>
            </div>

            {customRows.length > 0 && (
              <div className="space-y-1.5">
                {customRows.map((row, index) => (
                  <div key={row.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-card">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">Row {index + 1}</span>
                    <Input
                      value={row.text}
                      onChange={(e) => updateCustomRow(row.id, e.target.value)}
                      placeholder="Leave blank for spacing, or type a title…"
                      className="h-8 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomRow(row.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workbook sheet preview / columns */}
          {grouped ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workbook sheets</Label>
                <p className="mt-1 text-xs text-muted-foreground">Only these non-empty sheets will be created, in the order shown. Open a sheet to customize its parameters.</p>
              </div>
              {groups.map((group, groupIndex) => {
                const isOpen = openGroups.has(group.key);
                const groupEnabled = group.columns.filter((column) => column.enabled).length;
                return (
                  <div key={group.key} className="overflow-hidden rounded-xl border bg-card">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => setOpenGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                        return next;
                      })}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileSpreadsheet className="h-4 w-4" /></span>
                      <span className="flex-1"><span className="block text-sm font-semibold">{groupIndex + 1}. {group.label}</span><span className="block text-xs text-muted-foreground">{group.count} record{group.count === 1 ? "" : "s"} · {groupEnabled}/{group.columns.length} parameters</span></span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="space-y-2 border-t bg-muted/20 p-3">
                        <div className="flex justify-end gap-2 text-xs">
                          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => updateGroupColumns(group.key, (items) => items.map((item) => ({ ...item, enabled: true })))}>All</button>
                          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => updateGroupColumns(group.key, (items) => items.map((item) => ({ ...item, enabled: false })))}>None</button>
                        </div>
                        {group.columns.map((column, columnIndex) => (
                          <div key={column.key} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", column.enabled ? "bg-card" : "border-dashed opacity-60")}>
                            <button type="button" onClick={() => updateGroupColumns(group.key, (items) => items.map((item, index) => index === columnIndex ? { ...item, enabled: !item.enabled } : item))} className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border-2", column.enabled ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                              {column.enabled && <span className="text-xs">✓</span>}
                            </button>
                            <input value={column.label} onChange={(event) => updateGroupColumns(group.key, (items) => items.map((item, index) => index === columnIndex ? { ...item, label: event.target.value } : item))} className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm outline-none focus:bg-muted" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {trailingSheets.map((sheet, index) => (
                <div key={sheet.label} className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">{groups.length + index + 1}. {sheet.label}</span><br />{sheet.count} record{sheet.count === 1 ? "" : "s"}</div>
              ))}
            </div>
          ) : <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Columns
                <span className="ml-2 font-normal normal-case text-muted-foreground">
                  {enabledCount} / {columns.length} selected
                </span>
              </Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={enableAll}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={disableAll}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors"
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={resetOrder}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors flex items-center gap-1"
                  title="Reset order"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {columns.map((col, i) => (
                <div
                  key={col.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={() => enterColumnDrag(i)}
                  onDrop={(e) => {
                    e.preventDefault();
                    endColumnDrag();
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                    col.enabled
                      ? "bg-card border-border"
                      : "bg-muted/40 border-dashed border-border/50 opacity-60",
                    dragOverIndex === i && "ring-2 ring-primary/30 border-primary/40"
                  )}
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => startColumnDrag(e, i)}
                    onDragEnd={endColumnDrag}
                    className="cursor-grab active:cursor-grabbing rounded p-1 text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors shrink-0"
                    title="Drag to reorder column"
                    aria-label={`Drag ${col.label} column to reorder`}
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>

                  {/* Checkbox */}
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

                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums w-5 text-right">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex gap-3 justify-end bg-card">
          {exportError && <p role="alert" className="mr-auto self-center text-sm text-destructive">{exportError}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={enabledCount === 0 || isExporting} className="gap-2">
            <Download className="w-4 h-4" />
            {isExporting ? "Preparing…" : exportLabel ?? "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
