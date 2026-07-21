import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { Sample } from "@workspace/api-client-react";
import {
  buildStyledWorksheet,
  getSampleColumns,
  sampleToDataRow,
  strikeDipToDataRow,
  STRIKE_DIP_COLUMNS,
  loadExportConfig,
  loadColumnPrefs,
  type ExportColumn,
  type ExportFormatConfig,
} from "./export-config";
import type { StrikeDipMeasurement } from "@/lib/strike-dip-measurements";
import { saveFile } from "./save-file";

export { getSampleColumns } from "./export-config";

export type DatasetLookupItem = { id: number | string; name: string };

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
  return datasets.find((dataset) => String(dataset.id) === String(datasetId))?.name || "Unknown Dataset";
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
  const ws = buildStyledWorksheet(columns, dataRows, config);

  const wb = XLSX.utils.book_new();
  appendSheet(wb, ws, config.sheetName || "Samples");
  const output = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  await saveFile(
    new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
  );
}

export async function exportDatasetWorkbookWithConfig({
  samples,
  measurements,
  datasets,
  folderName,
  filename,
  sampleColumns,
  sampleConfig,
}: {
  samples: Sample[];
  measurements: StrikeDipMeasurement[];
  datasets: DatasetLookupItem[];
  folderName: string;
  filename: string;
  sampleColumns: ExportColumn[];
  sampleConfig: ExportFormatConfig;
}) {
  if ((!samples || samples.length === 0) && (!measurements || measurements.length === 0)) return;

  const workbook = XLSX.utils.book_new();

  if (samples.length > 0) {
    const sampleRows = samples.map((sample) =>
      sampleToDataRow(sample, datasetNameForId(sample.folderId, datasets))
    );
    appendSheet(
      workbook,
      buildStyledWorksheet(sampleColumns, sampleRows, sampleConfig),
      sampleConfig.sheetName || "Samples",
    );
  }

  if (measurements.length > 0) {
    const strikeColumns = loadColumnPrefs("strikedip", STRIKE_DIP_COLUMNS);
    const strikeConfig = { ...loadExportConfig("strikedip"), sheetName: "Strike & Dip" };
    const strikeRows = measurements.map((measurement, index) =>
      strikeDipToDataRow(measurement, index, datasetNameForId(measurement.datasetId, datasets))
    );
    appendSheet(
      workbook,
      buildStyledWorksheet(strikeColumns, strikeRows, strikeConfig),
      strikeConfig.sheetName,
    );
  }

  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  await saveFile(
    new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
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
