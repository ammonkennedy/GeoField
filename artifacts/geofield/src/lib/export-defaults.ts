import type { ExportColumn, ExportCustomRow, ExportFormatConfig } from "./export-config";
import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

const KEY = "geofield_export_defaults";
export interface ExportDefault {
  key: string;
  columns: ExportColumn[];
  customRows: ExportCustomRow[];
  orientation: ExportFormatConfig["orientation"];
  sheetName?: string;
}
export function loadExportDefault(key: string): ExportDefault | undefined {
  return readDurableArray<ExportDefault>(KEY).find(item => item.key === key);
}
export function saveExportDefault(value: ExportDefault) {
  const current = readDurableArray<ExportDefault>(KEY);
  writeDurableArray(KEY, [...current.filter(item => item.key !== value.key), value]);
}
/** Keep saved ordering and choices, omit absent fields, append newly discovered fields. */
export function applyDefaultColumns(current: ExportColumn[], saved: ExportColumn[]): ExportColumn[] {
  const available = new Map(current.map(column => [column.key, column]));
  const ordered = saved.flatMap(column => {
    const original = available.get(column.key);
    if (!original) return [];
    available.delete(column.key);
    return [{ ...original, label: column.label, enabled: column.enabled }];
  });
  return [...ordered, ...available.values()];
}
