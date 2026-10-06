import { loadMeasurements, STRIKE_DIP_UPDATED_EVENT } from "@/lib/strike-dip-measurements";
import { resolveDatasetId } from "@/lib/dataset-identity";
import { useEffect, useMemo, useState } from "react";
import { BarChart2, FolderOpen } from "lucide-react";
import { useGetFolders, useGetSamples } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { DatasetFigures } from "@/components/DatasetFigures";
import { Label } from "@/components/ui/label";
import { getQueue, QUEUE_UPDATED_EVENT } from "@/lib/offline-queue";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import { CLOUD_SAMPLES_UPDATED_EVENT, getCachedCloudSamples, mergeCloudAndLocal } from "@/lib/cloud-samples";

export default function FiguresPage() {
  const { data: cloudSamples } = useGetSamples();
  const { data: cloudDatasets } = useGetFolders();
  const [measurements, setMeasurements] = useState(loadMeasurements);
  const [selection, setSelection] = useState("all");
  const [queuedSamples, setQueuedSamples] = useState(() => getQueue(true));
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const [cachedCloudSamples, setCachedCloudSamples] = useState(getCachedCloudSamples);

  useEffect(() => {
    const refreshMeasurements = () => setMeasurements(loadMeasurements());
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, refreshMeasurements);
    window.addEventListener("storage", refreshMeasurements);
    const refreshQueue = () => setQueuedSamples(getQueue(true));
    const refreshDatasets = () => setLocalDatasets(getLocalDatasets());
    const refreshCloud = () => setCachedCloudSamples(getCachedCloudSamples());
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshQueue);
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
    window.addEventListener("storage", refreshQueue);
    window.addEventListener("storage", refreshDatasets);
    window.addEventListener(CLOUD_SAMPLES_UPDATED_EVENT, refreshCloud);
    return () => {
      window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, refreshMeasurements);
      window.removeEventListener("storage", refreshMeasurements);
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshQueue);
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
      window.removeEventListener("storage", refreshQueue);
      window.removeEventListener("storage", refreshDatasets);
      window.removeEventListener(CLOUD_SAMPLES_UPDATED_EVENT, refreshCloud);
    };
  }, []);

  const datasets = useMemo(
    () => [...(cloudDatasets || []), ...getVisibleLocalDatasets(localDatasets, cloudDatasets)],
    [cloudDatasets, localDatasets],
  );
  const localSamples = queuedSamples.filter((item) => !item.deletedAt).map((item) => ({
    id: item.queuedId,
    targetId: item.targetId,
    isOffline: true,
    ...item.payload,
    createdAt: item.queuedAt,
    updatedAt: item.queuedAt,
  }));
  const allSamples = mergeCloudAndLocal((mergeCloudAndLocal(cloudSamples ?? [], cachedCloudSamples) as any[]).filter((sample) => !queuedSamples.some((item) => String(item.targetId ?? item.queuedId) === String(sample.id))), localSamples as any[]) as any[];
  const selectedSamples = selection === "all"
    ? allSamples
    : allSamples.filter((sample) => String(resolveDatasetId(sample.folderId, localDatasets) ?? "") === String(resolveDatasetId(selection, localDatasets)));
  const selectedDataset = datasets.find((dataset: any) => String(resolveDatasetId(dataset.id, localDatasets)) === String(resolveDatasetId(selection, localDatasets)));
  const selectedMeasurements = selection === "all" ? measurements : measurements.filter(item => String(resolveDatasetId(item.datasetId, localDatasets) ?? "") === String(resolveDatasetId(selection, localDatasets)));
  const selectionName = selection === "all" ? "All Samples & Measurements" : selectedDataset?.name || "Selected Dataset";

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
        <div>
          <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
            <BarChart2 className="h-8 w-8 text-primary" />
            Generate Figures
          </h1>
          <p className="mt-1 text-muted-foreground">Create organized, publication-ready charts from an entire account or a single dataset.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <Label htmlFor="figure-dataset" className="font-semibold">Data to include</Label>
          </div>
          <select
            id="figure-dataset"
            className="mt-3 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="all">All Samples & Measurements ({allSamples.length + measurements.length})</option>
            {datasets.map((dataset: any) => {
              const count = allSamples.filter((sample) => String(resolveDatasetId(sample.folderId, localDatasets) ?? "") === String(resolveDatasetId(dataset.id, localDatasets))).length;
              const measurementCount = measurements.filter(item => String(resolveDatasetId(item.datasetId, localDatasets) ?? "") === String(resolveDatasetId(dataset.id, localDatasets))).length;
              return <option key={dataset.id} value={String(dataset.id)}>{dataset.name} ({count} samples, {measurementCount} measurements)</option>;
            })}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">{selectedSamples.length} sample{selectedSamples.length === 1 ? "" : "s"} and {selectedMeasurements.length} measurements selected.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectionName}</h2>
              <p className="text-sm text-muted-foreground">Choose a numeric parameter and figure style.</p>
            </div>
            <DatasetFigures measurements={selectedMeasurements} samples={selectedSamples as any} datasetName={selectionName} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
