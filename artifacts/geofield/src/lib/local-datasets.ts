import { getQueue, setQueue } from "./offline-queue.ts";
import { reassignMeasurementsDataset } from "./strike-dip-measurements.ts";
import { archiveLocalItem, getLocalDeletedItems, removeLocalDeletedItem, type LocalDeletedItem } from "./recently-deleted.ts";
import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

export interface LocalDataset {
  id: number;
  localRevision?: string;
  deletedAt?: string | null;
  name: string;
  description?: string;
  createdAt: string;
  isLocal: true;
  tripId?: string;
  cloudId?: string;
  syncId?: string;
  syncStatus?: "local" | "syncing" | "synced" | "error";
  syncedAt?: string;
}

const LOCAL_DATASETS_KEY = "geofield_local_datasets";
export const LOCAL_DATASETS_UPDATED_EVENT = "local-datasets-updated";

export function getLocalDatasets(includeDeleted = false): LocalDataset[] {
  const stored = readDurableArray<LocalDataset>(LOCAL_DATASETS_KEY);
  const ids = new Set(stored.map((item) => item.id));
  let migrated = false;
  for (const item of getLocalDeletedItems()) {
    if (item.kind !== "dataset" || !item.data?.cloudId || ids.has(item.data.id)) continue;
    stored.push({ ...item.data, deletedAt: item.deletedAt, localRevision: crypto.randomUUID() });
    ids.add(item.data.id); migrated = true;
  }
  if (migrated) writeDurableArray(LOCAL_DATASETS_KEY, stored);
  return stored.filter((item) => includeDeleted || !item.deletedAt);
}

function saveLocalDatasets(datasets: LocalDataset[]) {
  writeDurableArray(LOCAL_DATASETS_KEY, datasets);
  window.dispatchEvent(new CustomEvent(LOCAL_DATASETS_UPDATED_EVENT));
}

/** Persist before sending so a lost AWS response cannot create duplicate datasets. */
export function getLocalDatasetSyncId(id: number): string {
  const datasets = getLocalDatasets(true);
  const dataset = datasets.find((item) => item.id === id);
  if (!dataset) throw new Error("Local dataset no longer exists.");
  if (dataset.syncId) return dataset.syncId;
  const syncId = crypto.randomUUID();
  saveLocalDatasets(datasets.map((item) => item.id === id ? { ...item, syncId } : item));
  return syncId;
}

export function getPendingLocalDatasets(): LocalDataset[] {
  return getLocalDatasets(true).filter((dataset) => !dataset.cloudId || dataset.localRevision);
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
    getLocalDatasets(true).map((dataset) =>
      String(dataset.id) === String(id) ? { ...dataset, syncStatus } : dataset
    )
  );
}

export function markLocalDatasetSynced(id: number | string, cloudId: string, revision?: string) {
  saveLocalDatasets(
    getLocalDatasets(true).map((dataset) =>
      String(dataset.id) === String(id)
        ? {
            ...dataset,
            cloudId,
            localRevision: dataset.localRevision === revision ? undefined : dataset.localRevision,
            syncStatus: "synced",
            syncedAt: new Date().toISOString(),
          }
        : dataset
    )
  );

  setQueue(
    getQueue(true).map((item) =>
      String(item.payload.folderId) === String(id)
        ? { ...item, payload: { ...item.payload, folderId: cloudId } }
        : item
    )
  );
  reassignMeasurementsDataset(id, cloudId);
}

function nextLocalDatasetId() {
  const used = new Set(getLocalDatasets(true).map((item) => item.id));
  let id = -Date.now();
  while (used.has(id)) id--;
  return id;
}

export function createLocalDataset(input: { name: string; description?: string }): LocalDataset {
  const dataset: LocalDataset = {
    id: nextLocalDatasetId(),
    localRevision: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || "",
    createdAt: new Date().toISOString(),
    isLocal: true,
  };

  saveLocalDatasets([...getLocalDatasets(true), dataset]);
  return dataset;
}

export function createTripDataset(input: { tripId: string; name: string; description?: string; cloudId?: string | null }): LocalDataset {
  if (input.cloudId) return attachTripDataset(input.tripId, input.cloudId, input.name);
  const existing = getLocalDatasets(true).find((dataset) => dataset.tripId === input.tripId);
  if (existing) return existing;

  const dataset: LocalDataset = {
    id: nextLocalDatasetId(),
    localRevision: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || "",
    createdAt: new Date().toISOString(),
    isLocal: true,
    tripId: input.tripId,
  };

  saveLocalDatasets([...getLocalDatasets(true), dataset]);
  return dataset;
}

export function updateLocalDataset(id: number, input: { name: string; description?: string }) {
  saveLocalDatasets(
    getLocalDatasets(true).map((dataset) =>
      String(dataset.id) === String(id)
        ? { ...dataset, name: input.name.trim(), description: input.description?.trim() || "", localRevision: crypto.randomUUID() }
        : dataset
    )
  );
}

export function deleteLocalDataset(id: number | string) {
  const dataset = getLocalDatasets(true).find((item) => String(item.id) === String(id));
  if (dataset) archiveLocalItem("dataset", dataset.name, dataset);
  saveLocalDatasets(getLocalDatasets(true).map((item) => String(item.id) === String(id) ? { ...item, deletedAt: new Date().toISOString(), localRevision: crypto.randomUUID() } : item));

  // Keep samples and measurements instead of deleting them: move them to Uncategorized.
  setQueue(
    getQueue(true).map((item) =>
      (String(item.payload.folderId) === String(id) || (dataset?.cloudId && String(item.payload.folderId) === dataset.cloudId))
        ? { ...item, payload: { ...item.payload, folderId: null } }
        : item
    )
  );
  reassignMeasurementsDataset(id, null);
  if (dataset?.cloudId) reassignMeasurementsDataset(dataset.cloudId, null);
}

export async function restoreLocalDataset(item: LocalDeletedItem) {
  if (item.kind !== "dataset") return;
  const datasets = getLocalDatasets(true);
  const restored = { ...item.data, deletedAt: null, localRevision: crypto.randomUUID() };
  saveLocalDatasets([...datasets.filter((dataset) => String(dataset.id) !== String(item.data.id)), restored]);
  removeLocalDeletedItem(item.trashId);
}

/** Apply explicit cloud deletions; never infer deletion from an incomplete list. */
export function reconcileLocalDatasets(remote: Array<{ id: string | number; name: string; description?: string | null; deletedAt?: string | null }>) {
  const byId = new Map(remote.map((item) => [String(item.id), item]));
  saveLocalDatasets(getLocalDatasets(true).map((local) => {
    const cloud = local.cloudId ? byId.get(local.cloudId) : undefined;
    return cloud && !local.localRevision ? { ...local, name: cloud.name, description: cloud.description ?? "", deletedAt: cloud.deletedAt ?? null } : local;
  }));
}

/** Give a downloaded trip a local dataset alias without creating another cloud dataset. */
export function attachTripDataset(tripId: string, cloudId: string, name: string): LocalDataset {
  const datasets = getLocalDatasets(true);
  const existing = datasets.find((item) => item.tripId === tripId && item.cloudId === cloudId)
    ?? datasets.find((item) => item.cloudId === cloudId);
  if (existing) return existing;
  const dataset: LocalDataset = { id: nextLocalDatasetId(), tripId, cloudId, name, createdAt: new Date().toISOString(), isLocal: true, syncStatus: "synced" };
  saveLocalDatasets([...datasets, dataset]);
  return dataset;
}
