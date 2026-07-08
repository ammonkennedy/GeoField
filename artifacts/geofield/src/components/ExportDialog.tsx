import { useEffect, useState, useMemo } from "react";
import { useGetFolders } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Download, FolderOpen, Layers, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportCustomizerDialog } from "./ExportCustomizerDialog";
import { exportSamplesWithConfig, getSampleColumns } from "@/lib/export";
import { loadExportConfig, loadColumnPrefs } from "@/lib/export-config";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";

type Selection = "all" | "uncategorized" | number | string;

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples?: any[];
}

export function ExportDialog({ open, onOpenChange, samples = [] }: ExportDialogProps) {
  const [selected, setSelected] = useState<Selection>("all");
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const { data: folders } = useGetFolders();
  const allSamples = samples;
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];

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

  const count = samplesToExport.length;
  const selectedFolder =
    selected !== "all" && selected !== "uncategorized"
      ? allFolders.find((f: any) => String(f.id) === String(selected))
      : null;
  const uncategorizedCount = (allSamples || []).filter((s) => !s.folderId).length;

  const folderName = selectedFolder
    ? selectedFolder.name
    : selected === "uncategorized"
    ? "Uncategorized"
    : "All Samples";

  const filename = selectedFolder
    ? `geofield-${selectedFolder.name.replace(/\s+/g, "-").toLowerCase()}`
    : selected === "uncategorized"
    ? "geofield-uncategorized"
    : "geofield-all";

  // Derive columns + load saved prefs when customizer opens
  const derivedColumns = useMemo(
    () => loadColumnPrefs("samples", getSampleColumns(samplesToExport)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customizerOpen]
  );
  const savedConfig = useMemo(
    () => loadExportConfig("samples"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customizerOpen]
  );

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
              Choose which samples to include, then customize the column order and formatting.
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <OptionRow
                icon={<Layers className="w-4 h-4" />}
                label="All Samples"
                count={allSamples?.length ?? 0}
                selected={selected === "all"}
                onClick={() => setSelected("all")}
              />
              {allFolders.map((folder: any) => (
                <OptionRow
                  key={folder.id}
                  icon={<FolderOpen className="w-4 h-4" />}
                  label={`${folder.name}${folder.isLocal ? " (local)" : ""}`}
                  count={(allSamples || []).filter((s) => String(s.folderId ?? "") === String(folder.id)).length}
                  selected={String(selected) === String(folder.id)}
                  onClick={() => setSelected(folder.id)}
                />
              ))}
              {uncategorizedCount > 0 && (
                <OptionRow
                  icon={<FolderOpen className="w-4 h-4 opacity-40" />}
                  label="Uncategorized"
                  count={uncategorizedCount}
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
        subtitle={`${count} sample${count !== 1 ? "s" : ""} from "${folderName}"`}
        initialColumns={derivedColumns}
        initialConfig={savedConfig}
        configKey="samples"
        exportLabel={`Export ${count} sample${count !== 1 ? "s" : ""}`}
        onExport={(columns, config) => {
          exportSamplesWithConfig(samplesToExport, folderName, filename, columns, config);
        }}
      />
    </>
  );
}

function OptionRow({
  icon, label, count, selected, onClick, muted,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
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
        <span className={cn("truncate max-w-[220px]", muted && "text-muted-foreground")}>{label}</span>
      </div>
      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-mono shrink-0 ml-2">
        {count}
      </span>
    </button>
  );
}
