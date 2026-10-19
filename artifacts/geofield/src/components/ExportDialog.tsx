import { DatasetMultiSelect } from "./DatasetMultiSelect";
import { datasetOptions, datasetSelected, datasetSelectionLabel, type DatasetSelection } from "@/lib/dataset-selection";
import { useEffect, useState, useMemo } from "react";
import { useGetFolders } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Download, ChevronRight } from "lucide-react";
import { ExportCustomizerDialog } from "./ExportCustomizerDialog";
import { exportDatasetWorkbookWithConfig, getSampleColumns, SAMPLE_TYPE_SHEETS, type SampleTypeSheetKey } from "@/lib/export";
import { DEFAULT_FORMAT_CONFIG, STRIKE_DIP_COLUMNS } from "@/lib/export-config";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import type { StrikeDipMeasurement } from "@/lib/strike-dip-measurements";

type Selection = "all" | "uncategorized" | number | string;

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples?: any[];
  measurements?: StrikeDipMeasurement[];
  initialSelection?: Selection;
}

export function ExportDialog({ open, onOpenChange, samples = [], measurements = [], initialSelection = "all" }: ExportDialogProps) {
  const [selected, setSelected] = useState<DatasetSelection>(initialSelection === "all" ? "all" : [initialSelection === "uncategorized" ? "" : String(initialSelection)]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const { data: folders } = useGetFolders();
  const allSamples = samples;
  const allMeasurements = measurements;
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];

  useEffect(() => {
    if (open) setSelected(initialSelection === "all" ? "all" : [initialSelection === "uncategorized" ? "" : String(initialSelection)]);
  }, [initialSelection, open]);

  useEffect(() => {
    const refresh = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const options = datasetOptions(allFolders, localDatasets, [...allSamples.map(sample => sample.folderId), ...allMeasurements.map(item => item.datasetId)]);
  const samplesToExport = useMemo(() => allSamples.filter(sample => datasetSelected(selected, sample.folderId, localDatasets)), [allSamples, selected, localDatasets]);
  const measurementsToExport = useMemo(() => allMeasurements.filter(item => datasetSelected(selected, item.datasetId, localDatasets)), [allMeasurements, selected, localDatasets]);
  const sampleCount = samplesToExport.length;
  const measurementCount = measurementsToExport.length;
  const count = sampleCount + measurementCount;
  const folderName = datasetSelectionLabel(selected, options, localDatasets);
  const filename = selected === "all" ? "geofield-all" : selected.length === 1
    ? `geofield-${folderName.replace(/\s+/g, "-").toLowerCase()}` : "geofield-selected-datasets";

  // Match the workbook's visible sheet order so the user can predict the file.
  const sheetGroups = useMemo(
    () => [...SAMPLE_TYPE_SHEETS.flatMap((sheet) => {
      const typeSamples = samplesToExport.filter((sample) => sample.sampleType === sheet.key);
      if (typeSamples.length === 0) return [];
      return [{
        key: sheet.key,
        label: `${sheet.label} sheet`,
        count: typeSamples.length,
        columns: getSampleColumns(typeSamples),
      }];
    }), ...(measurementCount > 0 ? [{ key: "measurements", label: "Measurements sheet", count: measurementCount, columns: STRIKE_DIP_COLUMNS.map(column => ({ ...column })) }] : [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customizerOpen, samplesToExport, measurementCount]
  );
  const savedConfig = DEFAULT_FORMAT_CONFIG;

  const handleCustomize = () => {
    if (count === 0) return;
    onOpenChange(false);
    setCustomizerOpen(true);
  };

  return (
    <>
      {/* Step 1 — Dataset selection */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Download className="w-5 h-5 text-primary" />
              Export to Excel
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Choose datasets to export samples and measurements together.
            </p>

            <DatasetMultiSelect options={options} identities={localDatasets} value={selected} onChange={setSelected} />
            <p className="text-sm text-muted-foreground">{sampleCount} samples · {measurementCount} measurements selected</p>

            <div className="flex gap-3 pt-2 border-t">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={count === 0}
                onClick={handleCustomize}
              >
                Customize &amp; Export
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 2 — Column order + formatting */}
      <ExportCustomizerDialog
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        title="Customize Export"
        subtitle={`${sampleCount} sample${sampleCount !== 1 ? "s" : ""} and ${measurementCount} measurement${measurementCount !== 1 ? "s" : ""} from "${folderName}"`}
        initialColumns={[]}
        initialGroups={sheetGroups}
        initialConfig={savedConfig}
        configKey="samples"
        exportLabel={`Export ${count} record${count !== 1 ? "s" : ""}`}
        initialFileName={filename}
        onExportGroups={async (groups, config, chosenFileName) => {
          const measurementGroup = groups.find(group => group.key === "measurements");
          const sampleGroups = groups.filter(group => group.key !== "measurements");
          const sampleColumnsByType = Object.fromEntries(
            sampleGroups.map((group) => [group.key, group.columns])
          ) as Partial<Record<SampleTypeSheetKey, typeof groups[number]["columns"]>>;
          const sampleCustomRowsByType = Object.fromEntries(
            sampleGroups.map((group) => [group.key, group.customRows || []])
          );
          await exportDatasetWorkbookWithConfig({
            samples: samplesToExport,
            measurements: measurementsToExport,
            datasets: allFolders,
            folderName,
            filename: chosenFileName,
            sampleColumnsByType,
            sampleCustomRowsByType,
            sampleConfig: config,
            measurementColumns: measurementGroup?.columns,
            measurementCustomRows: measurementGroup?.customRows,
          });
        }}
      />
    </>
  );
}
