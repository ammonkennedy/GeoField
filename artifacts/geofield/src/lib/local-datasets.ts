import { getQueue, setQueue } from "@/lib/offline-queue";

export interface LocalDataset {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  isLocal: true;
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

export function updateLocalDataset(id: number, input: { name: string; description?: string }) {
  saveLocalDatasets(
    getLocalDatasets().map((dataset) =>
      dataset.id === id
        ? { ...dataset, name: input.name.trim(), description: input.description?.trim() || "" }
        : dataset
    )
  );
}

export function deleteLocalDataset(id: number) {
  saveLocalDatasets(getLocalDatasets().filter((dataset) => dataset.id !== id));

  // Keep samples instead of deleting them: move samples from the deleted local dataset to Uncategorized.
  setQueue(
    getQueue().map((item) =>
      item.payload.folderId === id
        ? { ...item, payload: { ...item.payload, folderId: null } }
        : item
    )
  );
}
