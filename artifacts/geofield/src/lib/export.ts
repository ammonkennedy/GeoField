import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { Sample } from "@workspace/api-client-react";
import {
  buildStyledWorksheet,
  getSampleColumns,
  sampleToDataRow,
  loadExportConfig,
  loadColumnPrefs,
  type ExportColumn,
  type ExportFormatConfig,
} from "./export-config";

export { getSampleColumns } from "./export-config";

/**
 * Export samples with a specific column order and formatting config.
 * Called from ExportDialog after the user has customized their export.
 */
export function exportSamplesWithConfig(
  samples: Sample[],
  folderName: string,
  filename: string,
  columns: ExportColumn[],
  config: ExportFormatConfig
) {
  if (!samples || samples.length === 0) return;

  const dataRows = samples.map((s) => sampleToDataRow(s, folderName));
  const ws = buildStyledWorksheet(columns, dataRows, config);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName || "Samples");
  XLSX.writeFile(wb, `${filename}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
}

/**
 * Quick export with saved (or default) preferences — no customization dialog.
 * Kept for backwards compatibility if needed.
 */
export function exportSamplesToExcel(
  samples: Sample[],
  folderName: string = "All Samples",
  filename: string = "geofield-export"
) {
  if (!samples || samples.length === 0) return;

  const defaultCols = getSampleColumns(samples);
  const columns = loadColumnPrefs("samples", defaultCols);
  const config = loadExportConfig("samples");

  exportSamplesWithConfig(samples, folderName, filename, columns, config);
}
