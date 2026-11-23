import { getQueue, setQueue, enqueue } from './offline-queue';
import { getCachedCloudSamples, cacheCloudSamples } from './cloud-samples';
import { getLocalDatasets, type LocalDataset } from './local-datasets';
import { loadMeasurements, saveMeasurements } from './strike-dip-measurements';
import { loadTracks, storeTracks, trackingStatus } from './tracks';
import { loadTrips, saveTrips } from './trips';
import { loadStereonets, saveStereonet } from './stereonet/storage';
import { stereonetInDataset } from './stereonet/dataset-association';
import { archiveLocalItem, removeLocalDeletedItem, type LocalDeletedItem } from './recently-deleted';
import { assertStorageAccount } from './storage-account';
import { getSamples, getStrikeDipMeasurements } from '@workspace/api-client-react';
import { syncTracks } from './sync-tracks';
import { syncTrips } from './sync-trips';
import { syncStereonets } from './stereonet/sync-account';

export type ProjectDeletionMode = 'project-only' | 'delete-data';

/** Download complete remote lists before finalizing a queued project deletion. */
export async function loadProjectDeletionContents(dataset: LocalDataset, account: string) {
  const cloudId = dataset.cloudId ?? dataset.syncId;
  if (!cloudId) return;
  const samples = await getSamples({ folderId: cloudId }, undefined, false, account);
  const measurements = await getStrikeDipMeasurements(true, account);
  await syncTracks(account);
  await syncStereonets(account);
  await syncTrips(account);
  assertStorageAccount(account);
  cacheCloudSamples(samples);
  const local = loadMeasurements(true);
  const ids = new Set(local.map(item => item.id));
  saveMeasurements([...local, ...measurements.filter(item => !ids.has(item.id)) as any[]], { fromSync: true });
}

/** Archive first, then stage reversible edits using each collection's normal sync. */
export async function applyProjectContents(dataset: LocalDataset, mode: ProjectDeletionMode, account: string) {
  assertStorageAccount(account);
  const ids = new Set([String(dataset.id), dataset.cloudId, dataset.syncId].filter(Boolean));
  const matches = (id: unknown) => id != null && ids.has(String(id));
  const tracks = loadTracks().filter(item => matches(item.datasetId));
  if (tracks.some(item => item.id === trackingStatus().activeId)) throw new Error('Stop recording this project’s track before deleting the project.');
  const deleting = mode === 'delete-data';
  const deletedAt = new Date().toISOString();
  // Capture cached cloud samples in the durable queue without replacing pending edits.
  for (const sample of getCachedCloudSamples().filter(item => matches(item.folderId))) {
    if (!getQueue(true).some(item => String(item.targetId ?? item.queuedId) === String(sample.id))) {
      enqueue({ sampleType: sample.sampleType, sampleId: sample.sampleId, folderId: sample.folderId ?? null, notes: sample.notes ?? undefined, fields: sample.fields as Record<string, any> }, String(sample.id), sample.updatedAt);
    }
  }
  const queue = getQueue(true);
  for (const item of queue.filter(item => !item.deletedAt && matches(item.payload.folderId))) {
    if (deleting) archiveLocalItem('sample', item.payload.sampleId, { ...item, projectDeletionRecovery: true, payload: { ...item.payload, folderId: null } });
  }
  setQueue(queue.map(item => !item.deletedAt && matches(item.payload.folderId) ? { ...item, payload: { ...item.payload, folderId: null }, ...(deleting ? { deletedAt } : {}) } : item));
  const measurements = loadMeasurements(true);
  for (const item of measurements.filter(item => !item.deletedAt && matches(item.datasetId))) {
    if (deleting) {
      // Detached recovery copies remain accessible even if the project stays deleted.
      archiveLocalItem('measurement', item.label || 'Measurement', { ...item, datasetId: null });
    }
  }
  saveMeasurements(measurements.map(item => !item.deletedAt && matches(item.datasetId) ? { ...item, datasetId: null, updatedAt: deletedAt, ...(deleting ? { deletedAt } : {}) } : item));
  for (const item of tracks) {
    if (deleting) archiveLocalItem('track', item.name, { ...item, datasetId: null });
  }
  await storeTracks(tracks.map(item => ({ ...item, datasetId: null, localRevision: crypto.randomUUID(), ...(deleting ? { deletedAt, visible: false } : {}) })));
  assertStorageAccount(account);
  if (loadTracks().some(item => matches(item.datasetId))) throw new Error('A track changed while the project was being deleted. Its latest data is safe; please retry.');
  for (const net of loadStereonets().filter(net => stereonetInDataset(net, dataset.id, getLocalDatasets(true)))) {
    const detached = { ...net, savedDatasetId: undefined,
      groups: net.groups.map(group => matches(group.sourceDatasetId) ? { ...group, sourceDatasetId: undefined } : group),
      measurements: net.measurements.map(item => matches(item.raw.datasetId) ? { ...item, raw: { ...item.raw, datasetId: null } } : item),
    };
    if (deleting) archiveLocalItem('stereonet', net.name, detached);
    saveStereonet({ ...detached, ...(deleting ? { deletedAt } : {}) }, account);
  }
  const trips = loadTrips().filter(item => matches(item.datasetId) || matches(item.cloudDatasetId));
  for (const item of trips) if (deleting) archiveLocalItem('trip', item.name, { ...item, datasetId: undefined, cloudDatasetId: null });
  saveTrips(trips.map(item => ({ ...item, datasetId: undefined, cloudDatasetId: null, ...(deleting ? { deletedAt } : {}) })));
}

export async function restoreProjectContent(item: LocalDeletedItem, account: string) {
  assertStorageAccount(account);
  if (item.kind === 'track') {
    await storeTracks([{ ...item.data, id: `restored-${item.trashId}`, cloudRevision: undefined, deletedAt: undefined, localRevision: crypto.randomUUID() }]);
  } else if (item.kind === 'trip') {
    saveTrips([{ ...item.data, id: `restored-${item.trashId}`, cloudUpdatedAt: undefined, deletedAt: null }]);
  } else if (item.kind === 'stereonet') {
    saveStereonet({ ...item.data, id: `restored-${item.trashId}`, localRevision: undefined, cloudRevision: undefined, deletedAt: undefined }, account);
  } else throw new Error('Unsupported project content.');
  assertStorageAccount(account);
  removeLocalDeletedItem(item.trashId);
}
