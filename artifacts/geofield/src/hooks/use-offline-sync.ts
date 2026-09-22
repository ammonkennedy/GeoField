import { syncTrips } from "@/lib/sync-trips";
import { loadTrips, TRIPS_UPDATED } from "@/lib/trips";
import { preparePhotoForMeasurement, downloadMeasurementPhotos } from "@/lib/sync-measurement-photos";
import { getStorageAccountId } from "@/lib/storage-account";
import { syncQueuedSample } from "@/lib/sync-sample-queue";
import { prepareSampleUpload, cacheSamplePhotos } from "@/lib/sync-sample-media";
import { syncFieldNotes } from "@/lib/sync-field-notes";
import { loadFieldNotes, FIELD_NOTES_UPDATED } from "@/lib/field-notes";
import { isRetryableSyncError, requiresCloudSignIn, syncRetryDelay } from "@/lib/sync-retry";
import { syncMeasurementRecords } from "@/lib/sync-measurements";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  requireCloudSyncSession,
  requireFieldNoteAccount,
  useGetCurrentAuthUser,
  createFolder,
  updateFolder,
  deleteFolder,
  restoreFolder,
  createSample,
  getFolders,
  getSamples,
  getGetFoldersQueryKey,
  getGetSamplesQueryKey,
  getSample,
  updateSample,
  deleteSample,
  restoreSample,
  subscribeToAccountDataChanges,
  createStrikeDipMeasurement,
  getStrikeDipMeasurements,
  getStrikeDipMeasurement,
  updateStrikeDipMeasurement,
} from "@workspace/api-client-react";
import {
  getQueue,
  reconcileQueuedDatasetIds,
  removeFromQueue,
  QUEUE_UPDATED_EVENT,
} from "@/lib/offline-queue";
import {
  getPendingLocalDatasets,
  getLocalDatasets,
  reconcileLocalDatasets,
  getLocalDatasetSyncId,
  markLocalDatasetSynced,
  setLocalDatasetSyncStatus,
  LOCAL_DATASETS_UPDATED_EVENT,
  type LocalDataset,
} from "@/lib/local-datasets";
import {
  cacheCloudSamples,
  getCachedCloudSamples,
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

async function syncStrikeDipMeasurements(accountId: string) {
  const check = () => { if (getStorageAccountId() !== accountId) throw new Error("Account changed during sync. Local data has been preserved."); };
  check();
  // Repair links left with a local ID by older versions before comparing revisions.
  saveMeasurements(loadMeasurements(true));
  let count = 0;
  let syncError: unknown;
  try { count = await syncMeasurementRecords<StrikeDipMeasurement>({
    prepare: (item) => preparePhotoForMeasurement(item, accountId),
    load: () => { check(); return loadMeasurements(true); },
    save: (items) => { check(); saveMeasurements(items, { fromSync: true }); },
    get: async (id) => await getStrikeDipMeasurement(id, accountId) as unknown as StrikeDipMeasurement | null,
    list: async () => { await requireFieldNoteAccount(accountId); return await getStrikeDipMeasurements(true, accountId) as unknown as StrikeDipMeasurement[]; },
    create: async (item) => { await requireFieldNoteAccount(accountId); return await createStrikeDipMeasurement({ ...item, createdAt: item.createdAt ?? new Date().toISOString(), updatedAt: item.updatedAt ?? new Date().toISOString() } as any, accountId) as unknown as StrikeDipMeasurement; },
    update: async (item) => { await requireFieldNoteAccount(accountId); return await updateStrikeDipMeasurement(item as any, accountId) as unknown as StrikeDipMeasurement; },
  }); } catch (error) { syncError = error; }
  try { await downloadMeasurementPhotos(accountId); }
  catch (error) { if (syncError) throw new AggregateError([syncError, error], `${syncError instanceof Error ? syncError.message : "Measurement sync failed."} ${error instanceof Error ? error.message : "Photo download failed."}`); throw error; }
  if (syncError) throw syncError;
  return count;
}

function isLocalDatasetId(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric < 0;
}

function getSyncableQueue() {
  return getQueue(true).filter(
    (item) =>
      item.payload.fields?.collectionStatus !== "planned" &&
      item.payload.sampleType !== "air",
  );
}

function getPendingSyncCount(accountId = "") {
  return loadTrips(true).filter((trip) => trip.localRevision).length + loadFieldNotes(accountId).filter((note) => note.localRevision).length + getPendingLocalDatasets().length + getSyncableQueue().length + loadMeasurements(true).filter((item) => item.localRevision).length;
}

async function syncLocalDataset(dataset: LocalDataset, checkAccount: () => void, accountId: string) {
  if (dataset.cloudId) {
    if (dataset.deletedAt) await deleteFolder({ id: dataset.cloudId, accountId });
    else {
      await updateFolder({ id: dataset.cloudId, accountId, data: { name: dataset.name, description: dataset.description } });
      checkAccount();
      await restoreFolder(dataset.cloudId, accountId);
    }
    checkAccount();
    markLocalDatasetSynced(dataset.id, dataset.cloudId, dataset.localRevision);
    return dataset.cloudId;
  }
  setLocalDatasetSyncStatus(dataset.id, "syncing");
  try {
    const id = getLocalDatasetSyncId(dataset.id);
    let created;
    try {
      created = await createFolder({
        id, accountId,
        data: {
          name: dataset.name,
          description: dataset.description || null,
        },
      });
    } catch (error) {
      // A lost response may hide a successful create. Reuse its durable ID.
      const existing = (await getFolders(false, accountId)).find(
        (folder) => String(folder.id) === id,
      );
      if (!existing) throw error;
      created = existing;
      checkAccount();
      if (existing.name !== dataset.name || (existing.description ?? "") !== (dataset.description ?? "")) {
        created = await updateFolder({ id, accountId, data: { name: dataset.name, description: dataset.description } });
      }
    }
    const cloudId = String(created.id);
    checkAccount();
    if (dataset.deletedAt) await deleteFolder({ id: cloudId, accountId });
    checkAccount();
    markLocalDatasetSynced(dataset.id, cloudId, dataset.localRevision);
    return cloudId;
  } catch (error) {
    checkAccount();
    setLocalDatasetSyncStatus(dataset.id, "error");
    throw error;
  }
}

export function useOfflineSync() {
  const { data: authData } = useGetCurrentAuthUser();
  const accountId = authData?.user ? String(authData.user.id) : "";
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(() => getPendingSyncCount(accountId));
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
    setQueueCount(getPendingSyncCount(accountId));
  }, [accountId]);

  useEffect(() => {
    refreshCount();
    window.addEventListener(FIELD_NOTES_UPDATED, refreshCount);
    window.addEventListener(TRIPS_UPDATED, refreshCount);
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, refreshCount);
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshCount);
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshCount);
    window.addEventListener("storage", refreshCount);
    return () => {
      window.removeEventListener(FIELD_NOTES_UPDATED, refreshCount);
      window.removeEventListener(TRIPS_UPDATED, refreshCount);
      window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, refreshCount);
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshCount);
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshCount);
      window.removeEventListener("storage", refreshCount);
    };
  }, [refreshCount]);

  const runSync = useCallback(
    async (rebuild: boolean) => {
      if (!accountId || syncingRef.current || !navigator.onLine) return;
      const checkAccount = () => { if (getStorageAccountId() !== accountId) throw new Error("Account changed during sync. Local data has been preserved."); };
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
        if (requiresCloudSignIn(error)) {
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
        await requireFieldNoteAccount(accountId);
        checkAccount();
        // Keep the old cache until a complete replacement has actually downloaded.
        const fullBackfill = rebuild || needsCloudBackfill();
        setSyncProgress(
          fullBackfill
            ? "Preparing full cloud backfill…"
            : "Checking cloud for updates…",
        );
        let synced = 0;

        for (const dataset of pendingDatasets) {
          try {
            await requireFieldNoteAccount(accountId);
            checkAccount();
            await syncLocalDataset(dataset, checkAccount, accountId);
            synced++;
          } catch (error) {
            reportFailure(error);
            refreshCount();
          }
        }

        checkAccount();
        reconcileQueuedDatasetIds(getLocalDatasets(true));
        const queue = getSyncableQueue();
        for (const item of queue) {
          if (
            item.payload.fields?.collectionStatus === "planned" ||
            isLocalDatasetId(item.payload.folderId)
          ) {
            if (isLocalDatasetId(item.payload.folderId)) {
              reportFailure(new Error("A sample is still assigned to a local dataset. Try syncing again."));
            }
            continue;
          }
          try {
            await requireFieldNoteAccount(accountId);
            checkAccount();
            const changed = await syncQueuedSample(item, {
              load: () => { checkAccount(); return getQueue(true); },
              prepare: (sample) => prepareSampleUpload(sample, accountId),
              create: async (id, payload) => { await requireFieldNoteAccount(accountId); return createSample({ id, data: payload as any, accountId }); },
              update: async (id, payload) => { await requireFieldNoteAccount(accountId); return updateSample({ id, data: payload as any, accountId }); },
              get: (id) => getSample(id, accountId),
              delete: async (id) => { await requireFieldNoteAccount(accountId); await deleteSample({ id, accountId }); return getSample(id, accountId); },
              restore: async (id) => { await requireFieldNoteAccount(accountId); await restoreSample(id, accountId); return getSample(id, accountId); },
              cache: (saved) => { checkAccount(); cacheCloudSamples([...getCachedCloudSamples().filter((sample) => String(sample.id) !== String(saved.id)), saved]); },
              remove: (id) => { checkAccount(); removeFromQueue(id); },
            });
            if (changed) retryNeeded = true;
            synced++;
          } catch (error: any) {
            reportFailure(error);
          }
        }

        // Always pull after uploads. A device with nothing pending still needs cloud changes.
        try {
          const results = await Promise.allSettled([
            getSamples(undefined, ({ page, downloaded }) =>
              setSyncProgress(
                `Downloading cloud samples: ${downloaded} received (page ${page})…`,
              ),
              true, accountId,
            ),
            getFolders(true, accountId),
            syncStrikeDipMeasurements(accountId),
            syncFieldNotes(accountId),
            syncTrips(accountId),
          ]);
          // Wait for every operation before releasing the sync lock. An early
          // Promise.all rejection previously left uploads running behind retries.
          checkAccount();
          await requireFieldNoteAccount(accountId);
          const [samplesResult, foldersResult] = results;
          for (const result of results)
            if (result.status === "rejected") reportFailure(result.reason);
          if (samplesResult.status === "fulfilled") {
            const mergedRemote = cacheCloudSamples(samplesResult.value);
            markCloudBackfillComplete(mergedRemote.length);
            setDownloadedCount(mergedRemote.length);
            setTimeout(() => setDownloadedCount(0), 5000);
            queryClient.setQueryData(getGetSamplesQueryKey(), mergedRemote);
            for (const sample of mergedRemote) {
              checkAccount();
              const cached = await cacheSamplePhotos(sample);
              checkAccount();
              if (cached !== sample) cacheCloudSamples([cached], true);
            }
          }
          if (foldersResult.status === "fulfilled") {
            reconcileLocalDatasets(foldersResult.value);
            queryClient.setQueryData(
              getGetFoldersQueryKey(),
              foldersResult.value.filter((item: any) => !item.deletedAt),
            );
          }
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
        if (!failed && (loadTrips(true).some((trip) => trip.localRevision) || getPendingLocalDatasets().length > 0 || loadMeasurements(true).some((item) => item.localRevision && !isLocalDatasetId(item.datasetId)) || loadFieldNotes(accountId).some((note) => note.localRevision))) retryNeeded = true;
        if (retryNeeded && !authRequired) scheduleRetry();
      }
    },
    [queryClient, refreshCount, cancelRetry, scheduleRetry, accountId],
  );

  const sync = useCallback(() => runSync(false), [runSync]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      // Sync writes also emit storage events; do not turn a pending failed link
      // into an unbounded immediate retry loop. runSync schedules safe retries.
      if (syncingRef.current) return;
      if (!loadFieldNotes(accountId).some((note) => note.localRevision) && !loadTrips(true).some((trip) => trip.localRevision) && !loadMeasurements(true).some((item) => item.localRevision)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (navigator.onLine) void sync(); }, 1500);
    };
    window.addEventListener(FIELD_NOTES_UPDATED, changed);
    window.addEventListener(TRIPS_UPDATED, changed);
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, changed);
    return () => { clearTimeout(timer); window.removeEventListener(FIELD_NOTES_UPDATED, changed); window.removeEventListener(TRIPS_UPDATED, changed); window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, changed); };
  }, [accountId, sync]);
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
