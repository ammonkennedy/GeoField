import { isRetryableSyncError, syncRetryDelay } from "@/lib/sync-retry";
import { syncMeasurementRecords } from "@/lib/sync-measurements";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  requireCloudSyncSession,
  createFolder,
  createSample,
  getFolders,
  getSamples,
  getGetFoldersQueryKey,
  getGetSamplesQueryKey,
  getSample,
  updateSample,
  subscribeToAccountDataChanges,
  createStrikeDipMeasurement,
  getStrikeDipMeasurements,
  updateStrikeDipMeasurement,
} from "@workspace/api-client-react";
import {
  getQueue,
  removeFromQueue,
  QUEUE_UPDATED_EVENT,
} from "@/lib/offline-queue";
import {
  getPendingLocalDatasets,
  getLocalDatasetSyncId,
  markLocalDatasetSynced,
  setLocalDatasetSyncStatus,
  LOCAL_DATASETS_UPDATED_EVENT,
  type LocalDataset,
} from "@/lib/local-datasets";
import {
  cacheCloudSamples,
  markCloudBackfillComplete,
  needsCloudBackfill,
} from "@/lib/cloud-samples";
import {
  loadMeasurements,
  saveMeasurements,
  STRIKE_DIP_UPDATED_EVENT,
  type StrikeDipMeasurement,
} from "@/lib/strike-dip-measurements";

// Layouts can unmount while requests are in flight; serialize across instances.
let syncInFlight = false;

async function syncStrikeDipMeasurements() {
  // Repair links left with a local ID by older versions before comparing revisions.
  saveMeasurements(loadMeasurements());
  return syncMeasurementRecords<StrikeDipMeasurement>({
    load: loadMeasurements,
    save: (items) => saveMeasurements(items, { fromSync: true }),
    list: async () => await getStrikeDipMeasurements() as unknown as StrikeDipMeasurement[],
    create: async (item) => await createStrikeDipMeasurement({ ...item, createdAt: item.createdAt ?? new Date().toISOString(), updatedAt: item.updatedAt ?? new Date().toISOString() } as any) as unknown as StrikeDipMeasurement,
    update: async (item) => await updateStrikeDipMeasurement(item as any) as unknown as StrikeDipMeasurement,
  });
}

function isLocalDatasetId(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric < 0;
}

function getSyncableQueue() {
  return getQueue().filter(
    (item) =>
      item.payload.fields?.collectionStatus !== "planned" &&
      item.payload.sampleType !== "air",
  );
}

function getPendingSyncCount() {
  return getPendingLocalDatasets().length + getSyncableQueue().length + loadMeasurements().filter((item) => item.localRevision).length;
}

async function syncLocalDataset(dataset: LocalDataset) {
  if (dataset.cloudId) return dataset.cloudId;
  setLocalDatasetSyncStatus(dataset.id, "syncing");
  try {
    const id = getLocalDatasetSyncId(dataset.id);
    let created;
    try {
      created = await createFolder({
        id,
        data: {
          name: dataset.name,
          description: dataset.description || null,
        },
      });
    } catch (error) {
      // A lost response may hide a successful create. Reuse its durable ID.
      const existing = (await getFolders()).find(
        (folder) => String(folder.id) === id,
      );
      if (!existing) throw error;
      created = existing;
    }
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
  const [cloudSignInRequired, setCloudSignInRequired] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const retryAttempt = useRef(0);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const mounted = useRef(true);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  const cancelRetry = useCallback(() => {
    clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
    setRetryAt(null);
  }, []);

  const scheduleRetry = useCallback(() => {
    if (
      !mounted.current ||
      !navigator.onLine ||
      retryTimer.current !== undefined
    )
      return;
    const delay = syncRetryDelay(retryAttempt.current++);
    setRetryAt(Date.now() + delay);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = undefined;
      setRetryAt(null);
      if (mounted.current && navigator.onLine) void syncRef.current();
    }, delay);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(retryTimer.current);
    };
  }, []);

  const refreshCount = useCallback(() => {
    setQueueCount(getPendingSyncCount());
  }, []);

  useEffect(() => {
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, refreshCount);
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshCount);
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshCount);
    window.addEventListener("storage", refreshCount);
    return () => {
      window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, refreshCount);
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshCount);
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshCount);
      window.removeEventListener("storage", refreshCount);
    };
  }, [refreshCount]);

  const runSync = useCallback(
    async (rebuild: boolean) => {
      if (syncingRef.current || !navigator.onLine) return;
      if (syncInFlight) { scheduleRetry(); return; }
      cancelRetry();
      const pendingDatasets = getPendingLocalDatasets();
      syncInFlight = true;
      syncingRef.current = true;
      setIsSyncing(true);
      setLastError(null);
      setCloudSignInRequired(false);
      let failed = false;
      let retryNeeded = false;
      let authRequired = false;
      const reportFailure = (error: any) => {
        failed = true;
        if (error?.name === "CloudSignInRequired") {
          authRequired = true;
          setCloudSignInRequired(true);
        }
        setLastError(
          error?.message ||
            "Could not sync. Your data is still saved on this device.",
        );
        if (isRetryableSyncError(error)) retryNeeded = true;
      };
      try {
        setSyncProgress("Connecting to cloud…");
        await requireCloudSyncSession();
        // Keep the old cache until a complete replacement has actually downloaded.
        const fullBackfill = rebuild || needsCloudBackfill();
        setSyncProgress(
          fullBackfill
            ? "Preparing full cloud backfill…"
            : "Checking cloud for updates…",
        );
        let synced = 0;

        try {
          for (const dataset of pendingDatasets) {
            await syncLocalDataset(dataset);
            synced++;
          }
        } catch (error: any) {
          reportFailure(error);
          refreshCount();
        }

        const queue = getSyncableQueue();
        for (const item of queue) {
          if (
            item.payload.fields?.collectionStatus === "planned" ||
            isLocalDatasetId(item.payload.folderId)
          ) {
            if (isLocalDatasetId(item.payload.folderId)) {
              setLastError(
                "A sample is still assigned to a local dataset. Try syncing again.",
              );
              break;
            }
            continue;
          }
          try {
            try {
              // Reuse the durable queue ID as the cloud ID. If connectivity drops
              // after AWS accepts the write, retrying cannot create a second copy.
              await createSample({
                data: item.payload as any,
                id: item.queuedId,
              });
            } catch (createError) {
              // A previous attempt may have succeeded even though its response
              // never reached this device. Confirm that record before retrying.
              try {
                await getSample(item.queuedId);
                await updateSample({
                  id: item.queuedId,
                  data: item.payload as any,
                });
              } catch {
                throw createError;
              }
            }
            // Do not acknowledge an edit made while this upload was in flight.
            const current = getQueue().find(
              (queued) => queued.queuedId === item.queuedId,
            );
            if (
              JSON.stringify(current?.payload) === JSON.stringify(item.payload)
            )
              removeFromQueue(item.queuedId);
            else if (current) retryNeeded = true;
            synced++;
          } catch (error: any) {
            reportFailure(error);
            break;
          }
        }

        // Always pull after uploads. A device with nothing pending still needs cloud changes.
        try {
          const results = await Promise.allSettled([
            getSamples(undefined, ({ page, downloaded }) =>
              setSyncProgress(
                `Downloading cloud samples: ${downloaded} received (page ${page})…`,
              ),
            ),
            getFolders(),
            syncStrikeDipMeasurements(),
          ]);
          // Wait for every operation before releasing the sync lock. An early
          // Promise.all rejection previously left uploads running behind retries.
          const [samplesResult, foldersResult] = results;
          for (const result of results)
            if (result.status === "rejected") reportFailure(result.reason);
          if (samplesResult.status === "fulfilled") {
            const mergedRemote = cacheCloudSamples(samplesResult.value);
            markCloudBackfillComplete(mergedRemote.length);
            setDownloadedCount(mergedRemote.length);
            setTimeout(() => setDownloadedCount(0), 5000);
            queryClient.setQueryData(getGetSamplesQueryKey(), mergedRemote);
          }
          if (foldersResult.status === "fulfilled")
            queryClient.setQueryData(
              getGetFoldersQueryKey(),
              foldersResult.value,
            );
        } catch (error) {
          reportFailure(error);
        }

        if (synced > 0) {
          setSyncedCount(synced);
          queryClient.invalidateQueries({ queryKey: getGetFoldersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
          setTimeout(() => setSyncedCount(0), 5000);
        }

        if (!failed) {
          retryAttempt.current = 0;
          cancelRetry();
        }
      } catch (error) {
        reportFailure(error);
      } finally {
        syncInFlight = false;
        syncingRef.current = false;
        setIsSyncing(false);
        setSyncProgress(null);
        refreshCount();
        if (!failed && loadMeasurements().some((item) => item.localRevision && !isLocalDatasetId(item.datasetId))) retryNeeded = true;
        if (retryNeeded && !authRequired) scheduleRetry();
      }
    },
    [queryClient, refreshCount, cancelRetry, scheduleRetry],
  );

  const sync = useCallback(() => runSync(false), [runSync]);
  const rebuildCloudCache = useCallback(() => runSync(true), [runSync]);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      cancelRetry();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync, cancelRetry]);

  useEffect(() => {
    if (isOnline) sync();
  }, [isOnline, sync]);

  useEffect(() => {
    if (!isOnline) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshAfterCurrentSync = () => {
      if (syncingRef.current) {
        refreshTimer = setTimeout(refreshAfterCurrentSync, 500);
        return;
      }
      sync();
    };
    const unsubscribe = subscribeToAccountDataChanges(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshAfterCurrentSync, 300);
    });
    return () => {
      clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [isOnline, sync]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) sync();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [sync]);

  return {
    isOnline,
    queueCount,
    isSyncing,
    syncedCount,
    downloadedCount,
    syncProgress,
    lastError,
    cloudSignInRequired,
    retryAt,
    sync,
    rebuildCloudCache,
  };
}
