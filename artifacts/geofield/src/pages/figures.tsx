import { DatasetMultiSelect } from "@/components/DatasetMultiSelect";
import { datasetOptions, datasetSelected, datasetSelectionLabel, type DatasetSelection } from "@/lib/dataset-selection";
import { loadMeasurements, STRIKE_DIP_UPDATED_EVENT } from "@/lib/strike-dip-measurements";
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
  const [selection, setSelection] = useState<DatasetSelection>("all");
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
  const options = datasetOptions(datasets, localDatasets, [...allSamples.map(sample => sample.folderId), ...measurements.map(item => item.datasetId)]);
  const selectedSamples = allSamples.filter(sample => datasetSelected(selection, sample.folderId, localDatasets));
  const selectedMeasurements = measurements.filter(item => datasetSelected(selection, item.datasetId, localDatasets));
  const selectionName = datasetSelectionLabel(selection, options, localDatasets);

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
        <div>
          <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
            <BarChart2 className="h-8 w-8 text-primary" />
            Generate Figures
          </h1>
          <p className="mt-1 text-muted-foreground">Create organized, publication-ready charts from selected projects or an entire account.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <Label htmlFor="figure-dataset" className="font-semibold">Data to include</Label>
          </div>
          <div className="mt-3"><DatasetMultiSelect id="figure-dataset" options={options} identities={localDatasets} value={selection} onChange={setSelection} /></div>
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
