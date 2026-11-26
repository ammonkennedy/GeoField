import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { Sample } from "@workspace/api-client-react";
import {
  buildStyledWorksheet,
  DEFAULT_FORMAT_CONFIG,
  getSampleColumns,
  sampleToDataRow,
  sampleNotes,
  strikeDipToDataRow,
  STRIKE_DIP_COLUMNS,
  loadExportConfig,
  loadColumnPrefs,
  type ExportColumn,
  type ExportFormatConfig,
} from "./export-config.ts";
import type { StrikeDipMeasurement } from "@/lib/strike-dip-measurements";
import { saveFile } from "./save-file.ts";

export { getSampleColumns } from "./export-config.ts";

export type DatasetLookupItem = { id: number | string; name: string };

export const SAMPLE_TYPE_SHEETS = [
  { key: "rock", label: "Rock" },
  { key: "water", label: "Water" },
  { key: "soil_sand", label: "Soil" },
  { key: "air", label: "Air" },
  { key: "other", label: "Other" },
] as const;

export type SampleTypeSheetKey = typeof SAMPLE_TYPE_SHEETS[number]["key"];

function cleanSheetName(name: string) {
  return (name || "Data").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Data";
}

function appendSheet(workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet, requestedName: string) {
  const baseName = cleanSheetName(requestedName);
  let sheetName = baseName;
  let suffix = 2;
  while (workbook.SheetNames.includes(sheetName)) {
    const suffixText = ` ${suffix}`;
    sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
}

export function datasetNameForId(
  datasetId: number | string | null | undefined,
  datasets: DatasetLookupItem[],
) {
  if (datasetId === null || datasetId === undefined || datasetId === "") return "Uncategorized";
  return datasets.find((dataset) => String(dataset.id) === String(datasetId))?.name || "Unknown Project";
}

function appendSampleNotes(workbook: XLSX.WorkBook, samples: Sample[], datasets: DatasetLookupItem[], folderName: string) {
  const rows = samples.filter(sample => sampleNotes(sample).trim()).map(sample => ({
    sample: sample.sampleId, type: sample.sampleType,
    project: datasets.length ? datasetNameForId(sample.folderId, datasets) : folderName,
    notes: sampleNotes(sample),
  }));
  if (!rows.length) return;
  appendSheet(workbook, buildStyledWorksheet([
    {key:'sample',label:'Sample ID',enabled:true,defaultWidth:24},
    {key:'type',label:'Sample Type',enabled:true,defaultWidth:16},
    {key:'project',label:'Project',enabled:true,defaultWidth:24},
    {key:'notes',label:'Field Notes',enabled:true,defaultWidth:80},
  ], rows, {...DEFAULT_FORMAT_CONFIG, sheetName: 'Sample Notes'}), 'Sample Notes');
}
/**
 * Export samples with a specific column order and formatting config.
 * Called from ExportDialog after the user has customized their export.
 */
export async function exportSamplesWithConfig(
  samples: Sample[],
  folderName: string,
  filename: string,
  columns: ExportColumn[],
  config: ExportFormatConfig,
  datasets: DatasetLookupItem[] = [],
) {
  if (!samples || samples.length === 0) return;

  const dataRows = samples.map((s) => sampleToDataRow(
    s,
    datasets.length ? datasetNameForId(s.folderId, datasets) : folderName,
  ));
  const allowed = new Set(getSampleColumns(samples).map(column => column.key));
  const ws = buildStyledWorksheet(columns.filter(column => allowed.has(column.key)), dataRows, config);

  const wb = XLSX.utils.book_new();
  appendSheet(wb, ws, config.sheetName || "Samples");
  appendSampleNotes(wb, samples, datasets, folderName);
  const { writeWorkbookWithSamplePhotos } = await import("./export-photos.ts");
  const output = await writeWorkbookWithSamplePhotos(wb, samples, datasets, folderName);
  await saveFile(
    new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
    { previewAfterSave: true },
  );
}

export function buildDatasetWorkbook({
  samples,
  measurements,
  datasets,
  folderName,
  filename,
  sampleColumnsByType,
  sampleCustomRowsByType,
  sampleConfig,
  orientationsByType,
  measurementColumns,
  measurementCustomRows,
}: {
  samples: Sample[];
  measurements: StrikeDipMeasurement[];
  datasets: DatasetLookupItem[];
  folderName: string;
  filename: string;
  sampleColumnsByType: Partial<Record<SampleTypeSheetKey, ExportColumn[]>>;
  sampleCustomRowsByType?: Partial<Record<SampleTypeSheetKey, ExportFormatConfig["customRows"]>>;
  sampleConfig: ExportFormatConfig;
  orientationsByType?: Record<string, ExportFormatConfig["orientation"] | undefined>;
  measurementColumns?: ExportColumn[];
  measurementCustomRows?: ExportFormatConfig["customRows"];
}) {
  if ((!samples || samples.length === 0) && (!measurements || measurements.length === 0)) return;

  const workbook = XLSX.utils.book_new();

  for (const sheet of SAMPLE_TYPE_SHEETS) {
    const typeSamples = samples.filter((sample) => sample.sampleType === sheet.key);
    if (typeSamples.length === 0) continue;
    const allowedColumns = new Set(getSampleColumns(typeSamples).map(column => column.key));
    const sampleRows = typeSamples.map((sample) =>
      sampleToDataRow(sample, datasetNameForId(sample.folderId, datasets))
    );
    appendSheet(
      workbook,
      buildStyledWorksheet(
        (sampleColumnsByType[sheet.key] || getSampleColumns(typeSamples)).filter(column => allowedColumns.has(column.key)),
        sampleRows,
        { ...sampleConfig, orientation: orientationsByType?.[sheet.key] ?? sampleConfig.orientation, customRows: sampleCustomRowsByType?.[sheet.key] || [] },
      ),
      sheet.label,
    );
  }

  if (measurements.length > 0) {
    const strikeColumns = measurementColumns ?? STRIKE_DIP_COLUMNS;
    const strikeConfig = { ...sampleConfig, orientation: orientationsByType?.measurements ?? sampleConfig.orientation, customRows: measurementCustomRows ?? [], sheetName: "Measurements" };
    const strikeRows = measurements.map((measurement, index) =>
      strikeDipToDataRow(measurement, index, datasetNameForId(measurement.datasetId, datasets))
    );
    appendSheet(
      workbook,
      buildStyledWorksheet(strikeColumns, strikeRows, strikeConfig),
      strikeConfig.sheetName,
    );
  }

  appendSampleNotes(workbook, samples, datasets, folderName);
  return workbook;
}

export async function exportDatasetWorkbookWithConfig(options: Parameters<typeof buildDatasetWorkbook>[0]) {
  const workbook = buildDatasetWorkbook(options);
  if (!workbook) return;
  const { filename } = options;
  const { writeWorkbookWithSamplePhotos } = await import("./export-photos.ts");
  const output = await writeWorkbookWithSamplePhotos(workbook, options.samples, options.datasets, options.folderName);
  await saveFile(
    new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
    { previewAfterSave: true },
  );
}

/**
 * Quick export with saved (or default) preferences — no customization dialog.
 * Kept for backwards compatibility if needed.
 */
export async function exportSamplesToExcel(
  samples: Sample[],
  folderName: string = "All Samples",
  filename: string = "geofield-export"
) {
  if (!samples || samples.length === 0) return;

  const defaultCols = getSampleColumns(samples);
  const columns = loadColumnPrefs("samples", defaultCols);
  const config = loadExportConfig("samples");

  await exportSamplesWithConfig(samples, folderName, filename, columns, config);
}
