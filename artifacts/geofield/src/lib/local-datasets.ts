import { getQueue, setQueue } from "@/lib/offline-queue";

export interface LocalDataset {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  isLocal: true;
  tripId?: string;
  cloudId?: string;
  syncStatus?: "local" | "syncing" | "synced" | "error";
  syncedAt?: string;
}

const LOCAL_DATASETS_KEY = "geofield_local_datasets";
export const LOCAL_DATASETS_UPDATED_EVENT = "local-datasets-updated";

export function getLocalDatasets(): LocalDataset[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DATASETS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalDatasets(datasets: LocalDataset[]) {
  localStorage.setItem(LOCAL_DATASETS_KEY, JSON.stringify(datasets));
  window.dispatchEvent(new CustomEvent(LOCAL_DATASETS_UPDATED_EVENT));
}

export function getPendingLocalDatasets(): LocalDataset[] {
  return getLocalDatasets().filter((dataset) => !dataset.cloudId);
}

export function getVisibleLocalDatasets(
  localDatasets: LocalDataset[],
  cloudDatasets: Array<{ id: number | string }> | undefined,
): LocalDataset[] {
  const cloudIds = new Set((cloudDatasets || []).map((dataset) => String(dataset.id)));
  return localDatasets.filter((dataset) => !dataset.cloudId || !cloudIds.has(String(dataset.cloudId)));
}

export function setLocalDatasetSyncStatus(
  id: number | string,
  syncStatus: LocalDataset["syncStatus"],
) {
  saveLocalDatasets(
    getLocalDatasets().map((dataset) =>
      String(dataset.id) === String(id) ? { ...dataset, syncStatus } : dataset
    )
  );
}

export function markLocalDatasetSynced(id: number | string, cloudId: string) {
  saveLocalDatasets(
    getLocalDatasets().map((dataset) =>
      String(dataset.id) === String(id)
        ? {
            ...dataset,
            cloudId,
            syncStatus: "synced",
            syncedAt: new Date().toISOString(),
          }
        : dataset
    )
  );

  setQueue(
    getQueue().map((item) =>
      String(item.payload.folderId) === String(id)
        ? { ...item, payload: { ...item.payload, folderId: cloudId } }
        : item
    )
  );
}

export function createLocalDataset(input: { name: string; description?: string }): LocalDataset {
  const dataset: LocalDataset = {
    id: -Date.now(),
    name: input.name.trim(),
    description: input.description?.trim() || "",
    createdAt: new Date().toISOString(),
    isLocal: true,
  };

  saveLocalDatasets([...getLocalDatasets(), dataset]);
  return dataset;
}

export function createTripDataset(input: { tripId: string; name: string; description?: string }): LocalDataset {
  const existing = getLocalDatasets().find((dataset) => dataset.tripId === input.tripId);
  if (existing) return existing;

  const dataset: LocalDataset = {
    id: -Date.now(),
    name: input.name.trim(),
    description: input.description?.trim() || "",
    createdAt: new Date().toISOString(),
    isLocal: true,
    tripId: input.tripId,
  };

  saveLocalDatasets([...getLocalDatasets(), dataset]);
  return dataset;
}

export function updateLocalDataset(id: number, input: { name: string; description?: string }) {
  saveLocalDatasets(
    getLocalDatasets().map((dataset) =>
      String(dataset.id) === String(id)
        ? { ...dataset, name: input.name.trim(), description: input.description?.trim() || "" }
        : dataset
    )
  );
}

export function deleteLocalDataset(id: number | string) {
  saveLocalDatasets(getLocalDatasets().filter((dataset) => String(dataset.id) !== String(id)));

  // Keep samples instead of deleting them: move samples from the deleted local dataset to Uncategorized.
  setQueue(
    getQueue().map((item) =>
      String(item.payload.folderId) === String(id)
        ? { ...item, payload: { ...item.payload, folderId: null } }
        : item
    )
  );
}
