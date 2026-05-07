import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { Sample } from "@workspace/api-client-react";

/* ── Column definition ──────────────────────────────────────────────────── */
export interface ExportColumn {
  key: string;
  label: string;
  enabled: boolean;
  defaultWidth?: number;
}

/* ── Format config ──────────────────────────────────────────────────────── */
export interface ExportFormatConfig {
  sheetName: string;
  headerBold: boolean;
  headerBgColor: string;    // 6-char hex WITHOUT #
  headerTextLight: boolean; // true = white text on dark bg
  zebraStripe: boolean;
  zebraColor: string;       // 6-char hex WITHOUT #
  freezeHeader: boolean;
}

export const DEFAULT_FORMAT_CONFIG: ExportFormatConfig = {
  sheetName: "Data",
  headerBold: true,
  headerBgColor: "1e3a5f",
  headerTextLight: true,
  zebraStripe: true,
  zebraColor: "EFF6FF",
  freezeHeader: true,
};

/* ── Color presets ──────────────────────────────────────────────────────── */
export const HEADER_COLOR_PRESETS = [
  { hex: "1e3a5f", name: "Navy" },
  { hex: "14532d", name: "Forest" },
  { hex: "374151", name: "Slate" },
  { hex: "6b21a8", name: "Purple" },
  { hex: "7f1d1d", name: "Crimson" },
  { hex: "78350f", name: "Amber" },
  { hex: "0f766e", name: "Teal" },
  { hex: "1e1e1e", name: "Black" },
];

export const ZEBRA_COLOR_PRESETS = [
  { hex: "EFF6FF", name: "Blue" },
  { hex: "F0FDF4", name: "Green" },
  { hex: "FDF4FF", name: "Purple" },
  { hex: "FEFCE8", name: "Yellow" },
  { hex: "F9FAFB", name: "Gray" },
  { hex: "FFF1F2", name: "Rose" },
];

/* ── Field label map ────────────────────────────────────────────────────── */
export const FIELD_LABELS: Record<string, string> = {
  collectionDate: "Collection Date & Time",
  location: "GPS Location",
  temperature: "Water Temp (°C)",
  ph: "pH Level",
  do: "Dissolved Oxygen (mg/L)",
  conductivity: "Conductivity (μS/cm)",
  turbidity: "Turbidity (NTU)",
  flowRate: "Flow Rate (m³/s)",
  color: "Color",
  odor: "Odor",
  preservation: "Preservation Method",
  rockType: "Rock Type",
  rockName: "Rock Name",
  lithology: "Lithology",
  texture: "Texture",
  sorting: "Sorting",
  hardness: "Hardness (Mohs)",
  specificGravity: "Specific Gravity",
  strike: "Strike",
  dip: "Dip",
  magnetism: "Magnetism",
  weight: "Weight (g)",
  horizon: "Horizon",
  moisture: "Moisture Content",
  depth: "Depth (cm)",
  structure: "Structure",
  organicMatter: "Organic Matter (%)",
};

/* ── Strike-dip default columns ─────────────────────────────────────────── */
export const STRIKE_DIP_COLUMNS: ExportColumn[] = [
  { key: "index",       label: "#",             enabled: true, defaultWidth: 4  },
  { key: "label",       label: "Label",          enabled: true, defaultWidth: 28 },
  { key: "strike",      label: "Strike",         enabled: true, defaultWidth: 10 },
  { key: "dip",         label: "Dip",            enabled: true, defaultWidth: 8  },
  { key: "dipDir",      label: "Dip Direction",  enabled: true, defaultWidth: 14 },
  { key: "featureType", label: "Feature Type",   enabled: true, defaultWidth: 18 },
  { key: "location",    label: "Location",       enabled: true, defaultWidth: 24 },
  { key: "date",        label: "Date",           enabled: true, defaultWidth: 12 },
  { key: "notes",       label: "Notes",          enabled: true, defaultWidth: 40 },
];

/* ── Sample columns ─────────────────────────────────────────────────────── */
export const SAMPLE_FIXED_COLUMNS: ExportColumn[] = [
  { key: "_sampleId",   label: "Sample ID",      enabled: true, defaultWidth: 16 },
  { key: "_sampleType", label: "Sample Type",    enabled: true, defaultWidth: 12 },
  { key: "_folder",     label: "Folder",         enabled: true, defaultWidth: 20 },
  { key: "_notes",      label: "Notes",          enabled: true, defaultWidth: 40 },
  { key: "_createdAt",  label: "Record Created", enabled: true, defaultWidth: 18 },
];

export function getSampleColumns(samples: Sample[]): ExportColumn[] {
  const fieldKeys = new Set<string>();
  samples.forEach((s) => {
    const fields = (s.fields as Record<string, any>) || {};
    Object.keys(fields).forEach((k) => {
      if (k !== "photo" && !k.startsWith("media")) fieldKeys.add(k);
    });
  });
  const dynamic: ExportColumn[] = [...fieldKeys].map((key) => ({
    key: `field_${key}`,
    label: FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").trim(),
    enabled: true,
    defaultWidth: 18,
  }));
  return [...SAMPLE_FIXED_COLUMNS, ...dynamic];
}

export function sampleToDataRow(sample: Sample, folderName: string): Record<string, any> {
  const fields = (sample.fields as Record<string, any>) || {};
  const row: Record<string, any> = {
    _sampleId: sample.sampleId,
    _sampleType:
      sample.sampleType === "soil_sand"
        ? "Soil/Sand"
        : sample.sampleType.charAt(0).toUpperCase() + sample.sampleType.slice(1),
    _folder: folderName,
    _notes: sample.notes || "",
    _createdAt: format(new Date(sample.createdAt), "yyyy-MM-dd HH:mm"),
  };
  Object.entries(fields).forEach(([key, value]) => {
    if (key === "photo" || key.startsWith("media")) return;
    row[`field_${key}`] = value !== undefined && value !== null ? String(value) : "";
  });
  return row;
}

/* ── Worksheet builder ──────────────────────────────────────────────────── */
export function buildStyledWorksheet(
  columns: ExportColumn[],
  dataRows: Record<string, any>[],
  config: ExportFormatConfig
): XLSX.WorkSheet {
  const enabled = columns.filter((c) => c.enabled);
  const headers = enabled.map((c) => c.label);

  const aoa = [
    headers,
    ...dataRows.map((row) =>
      enabled.map((c) => {
        const v = row[c.key];
        return v !== undefined && v !== null ? v : "";
      })
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = enabled.map((c) => ({ wch: c.defaultWidth ?? 15 }));

  if (config.freezeHeader) {
    (ws as any)["!freeze"] = { xSplit: 0, ySplit: 1 };
  }

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Header row styling
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: {
        bold: config.headerBold,
        color: { rgb: config.headerTextLight ? "FFFFFF" : "111111" },
      },
      fill: { patternType: "solid", fgColor: { rgb: config.headerBgColor.toUpperCase() } },
      alignment: { vertical: "center" },
    };
  }

  // Zebra striping (even data rows: r = 2, 4, 6…)
  if (config.zebraStripe) {
    for (let r = 2; r <= range.e.r; r += 2) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "z", v: "" };
        ws[addr].s = {
          ...(ws[addr].s || {}),
          fill: { patternType: "solid", fgColor: { rgb: config.zebraColor.toUpperCase() } },
        };
      }
    }
  }

  return ws;
}

/* ── localStorage helpers ────────────────────────────────────────────────── */
export function saveExportConfig(key: string, config: ExportFormatConfig) {
  try { localStorage.setItem(`geofield_export_fmt_${key}`, JSON.stringify(config)); } catch {}
}
export function loadExportConfig(key: string): ExportFormatConfig {
  try {
    const raw = localStorage.getItem(`geofield_export_fmt_${key}`);
    if (raw) return { ...DEFAULT_FORMAT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_FORMAT_CONFIG };
}

export function saveColumnPrefs(key: string, columns: ExportColumn[]) {
  try { localStorage.setItem(`geofield_export_cols_${key}`, JSON.stringify(columns)); } catch {}
}
export function loadColumnPrefs(key: string, defaults: ExportColumn[]): ExportColumn[] {
  try {
    const raw = localStorage.getItem(`geofield_export_cols_${key}`);
    if (!raw) return defaults;
    const saved: ExportColumn[] = JSON.parse(raw);
    const defaultMap = new Map(defaults.map((d) => [d.key, d]));
    const savedKeys = new Set(saved.map((c) => c.key));
    const merged: ExportColumn[] = saved
      .filter((c) => defaultMap.has(c.key))
      .map((c) => ({ ...defaultMap.get(c.key)!, label: c.label, enabled: c.enabled }));
    defaults.forEach((d) => { if (!savedKeys.has(d.key)) merged.push(d); });
    return merged;
  } catch {}
  return defaults;
}
