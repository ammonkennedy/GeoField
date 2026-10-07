import { getQueue, enqueue, updateQueuedSample, deleteQueuedSample } from './offline-queue.ts';
import { getCachedCloudSamples } from './cloud-samples.ts';
import { loadMeasurements, saveMeasurements, deleteMeasurement } from './strike-dip-measurements.ts';
import { archiveLocalItem } from './recently-deleted.ts';

export type BulkRecord = { key: string; kind: 'sample' | 'measurement'; id: string; name: string; sample?: any };
/** Operates on current storage rather than a stale selection snapshot. */
export function applyBulkRecord(record: BulkRecord, action: 'move' | 'delete', datasetId: string | null) {
  if (record.kind === 'measurement') {
    const current = loadMeasurements();
    if (!current.some(item => item.id === record.id)) throw new Error('Measurement is no longer available.');
    if (action === 'delete') deleteMeasurement(record.id);
    else saveMeasurements(current.map(item => item.id === record.id ? { ...item, datasetId, updatedAt: new Date(Math.max(Date.now(), (Date.parse(item.updatedAt || '') || 0) + 1)).toISOString() } : item));
    return;
  }
  const queued = getQueue(true).find(item => item.queuedId === record.id || item.targetId === record.id);
  if (queued?.deletedAt) throw new Error('Sample has already been deleted.');
  const cloud = getCachedCloudSamples().find(item => String(item.id) === String(queued?.targetId || record.id));
  const sample = queued?.payload || cloud || record.sample;
  if (!sample) throw new Error('Sample is no longer available.');
  if (sample.fields?.collectionStatus === 'planned') throw new Error('Manage future sites from their trip.');
  const payload = { sampleType: sample.sampleType, sampleId: sample.sampleId, folderId: sample.folderId ?? null, notes: sample.notes, fields: sample.fields || {} };
  if (action === 'move') {
    payload.folderId = datasetId;
    if (queued) updateQueuedSample(queued.queuedId, payload);
    else enqueue(payload, record.id, cloud?.updatedAt || sample.updatedAt);
  } else {
    const item = queued || enqueue(payload, record.id, cloud?.updatedAt || sample.updatedAt);
    archiveLocalItem('sample', payload.sampleId || 'Sample', item);
    deleteQueuedSample(item.queuedId);
  }
}
