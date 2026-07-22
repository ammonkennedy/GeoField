import { useEffect, useState, useMemo } from "react";
import { useGetFolders } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Download, FolderOpen, Layers, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportCustomizerDialog } from "./ExportCustomizerDialog";
import { exportDatasetWorkbookWithConfig, getSampleColumns, SAMPLE_TYPE_SHEETS, type SampleTypeSheetKey } from "@/lib/export";
import { DEFAULT_FORMAT_CONFIG } from "@/lib/export-config";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import type { StrikeDipMeasurement } from "@/lib/strike-dip-measurements";

type Selection = "all" | "uncategorized" | number | string;

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples?: any[];
  measurements?: StrikeDipMeasurement[];
  initialSelection?: Selection;
  lockSelection?: boolean;
}

export function ExportDialog({ open, onOpenChange, samples = [], measurements = [], initialSelection = "all", lockSelection = false }: ExportDialogProps) {
  const [selected, setSelected] = useState<Selection>(initialSelection);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const { data: folders } = useGetFolders();
  const allSamples = samples;
  const allMeasurements = measurements;
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];

  useEffect(() => {
    if (open) setSelected(initialSelection);
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

  const samplesToExport = useMemo(() => {
    if (!allSamples) return [];
    if (selected === "all") return allSamples;
    if (selected === "uncategorized") return allSamples.filter((s) => !s.folderId);
    return allSamples.filter((s) => String(s.folderId ?? "") === String(selected));
  }, [allSamples, selected]);

  const measurementsToExport = useMemo(() => {
    if (!allMeasurements) return [];
    if (selected === "all") return allMeasurements;
    if (selected === "uncategorized") return allMeasurements.filter((m) => !m.datasetId);
    return allMeasurements.filter((m) => String(m.datasetId ?? "") === String(selected));
  }, [allMeasurements, selected]);

  const sampleCount = samplesToExport.length;
  const measurementCount = measurementsToExport.length;
  const count = sampleCount + measurementCount;
  const selectedFolder =
    selected !== "all" && selected !== "uncategorized"
      ? allFolders.find((f: any) => String(f.id) === String(selected))
      : null;
  const displayedFolders = lockSelection && selectedFolder ? [selectedFolder] : allFolders;
  const uncategorizedCount = (allSamples || []).filter((s) => !s.folderId).length;
  const uncategorizedMeasurementCount = (allMeasurements || []).filter((m) => !m.datasetId).length;

  const folderName = selectedFolder
    ? selectedFolder.name
    : selected === "uncategorized"
    ? "Uncategorized"
    : "All Data";

  const filename = selectedFolder
    ? `geofield-${selectedFolder.name.replace(/\s+/g, "-").toLowerCase()}`
    : selected === "uncategorized"
    ? "geofield-uncategorized"
    : "geofield-all";

  // Match the workbook's visible sheet order so the user can predict the file.
  const sheetGroups = useMemo(
    () => SAMPLE_TYPE_SHEETS.flatMap((sheet) => {
      const typeSamples = samplesToExport.filter((sample) => sample.sampleType === sheet.key);
      if (typeSamples.length === 0) return [];
      return [{
        key: sheet.key,
        label: `${sheet.label} sheet`,
        count: typeSamples.length,
        columns: getSampleColumns(typeSamples),
      }];
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customizerOpen, samplesToExport]
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
              Choose a dataset to export samples and strike/dip measurements together.
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {!lockSelection && (
                <OptionRow
                  icon={<Layers className="w-4 h-4" />}
                  label="All Data"
                  count={(allSamples?.length ?? 0) + (allMeasurements?.length ?? 0)}
                  detail={`${allSamples?.length ?? 0} samples · ${allMeasurements?.length ?? 0} strike/dip`}
                  selected={selected === "all"}
                  onClick={() => setSelected("all")}
                />
              )}
              {displayedFolders.map((folder: any) => (
                <OptionRow
                  key={folder.id}
                  icon={<FolderOpen className="w-4 h-4" />}
                  label={`${folder.name}${folder.isLocal ? " (local)" : ""}`}
                  count={
                    (allSamples || []).filter((s) => String(s.folderId ?? "") === String(folder.id)).length +
                    (allMeasurements || []).filter((m) => String(m.datasetId ?? "") === String(folder.id)).length
                  }
                  detail={`${(allSamples || []).filter((s) => String(s.folderId ?? "") === String(folder.id)).length} samples · ${(allMeasurements || []).filter((m) => String(m.datasetId ?? "") === String(folder.id)).length} strike/dip`}
                  selected={String(selected) === String(folder.id)}
                  onClick={() => setSelected(folder.id)}
                />
              ))}
              {(!lockSelection || selected === "uncategorized") && (uncategorizedCount + uncategorizedMeasurementCount) > 0 && (
                <OptionRow
                  icon={<FolderOpen className="w-4 h-4 opacity-40" />}
                  label="Uncategorized"
                  count={uncategorizedCount + uncategorizedMeasurementCount}
                  detail={`${uncategorizedCount} samples · ${uncategorizedMeasurementCount} strike/dip`}
                  selected={selected === "uncategorized"}
                  onClick={() => setSelected("uncategorized")}
                  muted
                />
              )}
            </div>

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
        subtitle={`${sampleCount} sample${sampleCount !== 1 ? "s" : ""} and ${measurementCount} strike/dip measurement${measurementCount !== 1 ? "s" : ""} from "${folderName}"`}
        initialColumns={[]}
        initialGroups={sheetGroups}
        trailingSheets={measurementCount > 0 ? [{ label: "Strike & Dip sheet", count: measurementCount }] : []}
        initialConfig={savedConfig}
        configKey="samples"
        exportLabel={`Export ${count} record${count !== 1 ? "s" : ""}`}
        initialFileName={filename}
        onExportGroups={async (groups, config, chosenFileName) => {
          const sampleColumnsByType = Object.fromEntries(
            groups.map((group) => [group.key, group.columns])
          ) as Partial<Record<SampleTypeSheetKey, typeof groups[number]["columns"]>>;
          const sampleCustomRowsByType = Object.fromEntries(
            groups.map((group) => [group.key, group.customRows || []])
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
          });
        }}
      />
    </>
  );
}

function OptionRow({
  icon, label, count, detail, selected, onClick, muted,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  detail?: string;
  selected: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left",
        selected
          ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={muted ? "opacity-50" : ""}>{icon}</span>
        <span className="min-w-0">
          <span className={cn("block truncate max-w-[220px]", muted && "text-muted-foreground")}>{label}</span>
          {detail && <span className="block text-xs font-normal text-muted-foreground">{detail}</span>}
        </span>
      </div>
      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-mono shrink-0 ml-2">
        {count}
      </span>
    </button>
  );
}
