import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFolder,
  createSample,
  getFolders,
  getSamples,
  getGetFoldersQueryKey,
  getGetSamplesQueryKey,
} from "@workspace/api-client-react";
import { getQueue, removeFromQueue, QUEUE_UPDATED_EVENT } from "@/lib/offline-queue";
import {
  getPendingLocalDatasets,
  markLocalDatasetSynced,
  setLocalDatasetSyncStatus,
  LOCAL_DATASETS_UPDATED_EVENT,
  type LocalDataset,
} from "@/lib/local-datasets";
import { cacheCloudSamples, clearCachedCloudSamples, clearCloudBackfill, markCloudBackfillComplete, needsCloudBackfill } from "@/lib/cloud-samples";

function isLocalDatasetId(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric < 0;
}

function getSyncableQueue() {
  return getQueue().filter((item) =>
    item.payload.fields?.collectionStatus !== "planned"
  );
}

function getPendingSyncCount() {
  if (localStorage.getItem("geofield-demo-mode") === "true") return 0;
  return getPendingLocalDatasets().length + getSyncableQueue().length;
}

async function syncLocalDataset(dataset: LocalDataset) {
  if (dataset.cloudId) return dataset.cloudId;
  setLocalDatasetSyncStatus(dataset.id, "syncing");
  try {
    const created = await createFolder({
      data: {
        name: dataset.name,
        description: dataset.description || null,
      },
    });
    const cloudId = String(created.id);
    markLocalDatasetSynced(dataset.id, cloudId);
    return cloudId;
  } catch (error) {
    setLocalDatasetSyncStatus(dataset.id, "error");
    throw error;
  }
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(getPendingSyncCount);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(() => {
    setQueueCount(getPendingSyncCount());
  }, []);

  useEffect(() => {
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshCount);
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshCount);
    window.addEventListener("storage", refreshCount);
    return () => {
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshCount);
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshCount);
      window.removeEventListener("storage", refreshCount);
    };
  }, [refreshCount]);

  const runSync = useCallback(async (rebuild: boolean) => {
    if (syncingRef.current) return;
    if (localStorage.getItem("geofield-demo-mode") === "true") return;
    const pendingDatasets = getPendingLocalDatasets();
    syncingRef.current = true;
    setIsSyncing(true);
    setLastError(null);
    if (rebuild) {
      clearCachedCloudSamples();
      clearCloudBackfill();
    }
    const fullBackfill = rebuild || needsCloudBackfill();
    setSyncProgress(fullBackfill ? "Preparing full cloud backfill…" : "Checking cloud for updates…");
    let synced = 0;

    try {
      for (const dataset of pendingDatasets) {
        await syncLocalDataset(dataset);
        synced++;
      }
    } catch (error: any) {
      setLastError(error?.message || "Could not sync datasets. Make sure you are signed in, then try again.");
      refreshCount();
    }

    const queue = getSyncableQueue();
    for (const item of queue) {
      if (item.payload.fields?.collectionStatus === "planned" || isLocalDatasetId(item.payload.folderId)) {
        if (isLocalDatasetId(item.payload.folderId)) {
          setLastError("A sample is still assigned to a local dataset. Try syncing again.");
          break;
        }
        continue;
      }
      try {
        await createSample({ data: item.payload as any });
        removeFromQueue(item.queuedId);
        synced++;
      } catch (error: any) {
        setLastError(error?.message || "Could not sync. Make sure you are signed in, then try again.");
        break;
      }
    }

    // Always pull after uploads. A device with nothing pending still needs cloud changes.
    try {
      const [remoteSamples, remoteFolders] = await Promise.all([
        getSamples(undefined, ({ page, downloaded }) => setSyncProgress(`Downloading cloud samples: ${downloaded} received (page ${page})…`)),
        getFolders(),
      ]);
      const mergedRemote = cacheCloudSamples(remoteSamples);
      markCloudBackfillComplete(mergedRemote.length);
      setDownloadedCount(mergedRemote.length);
      setTimeout(() => setDownloadedCount(0), 5000);
      queryClient.setQueryData(getGetSamplesQueryKey(), mergedRemote);
      queryClient.setQueryData(getGetFoldersQueryKey(), remoteFolders);
      queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetFoldersQueryKey() });
      console.info(`[GeoField sync] Downloaded ${mergedRemote.length} samples and ${remoteFolders.length} datasets.`);
    } catch (error: any) {
      const message = error?.message || "Could not download samples from AWS.";
      console.error("[GeoField sync] Cloud download failed", error);
      setLastError(`Download failed: ${message}`);
    }

    if (synced > 0) {
      setSyncedCount(synced);
      queryClient.invalidateQueries({ queryKey: getGetFoldersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
      setTimeout(() => setSyncedCount(0), 5000);
    }

    refreshCount();
    syncingRef.current = false;
    setIsSyncing(false);
    setSyncProgress(null);
  }, [queryClient, refreshCount]);

  const sync = useCallback(() => runSync(false), [runSync]);
  const rebuildCloudCache = useCallback(() => runSync(true), [runSync]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync]);

  useEffect(() => {
    if (isOnline) sync();
  }, [isOnline, sync]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) sync();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [sync]);

  return { isOnline, queueCount, isSyncing, syncedCount, downloadedCount, syncProgress, lastError, sync, rebuildCloudCache };
}
