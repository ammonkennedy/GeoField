export interface QueuedSample {
  queuedId: string;
  targetId?: string;
  baseUpdatedAt?: string;
  deletedAt?: string | null;
  restore?: boolean;
  queuedAt: string;
  payload: {
    sampleType: string;
    sampleId: string;
    folderId: number | string | null;
    notes?: string;
    fields: Record<string, any>;
  };
}
import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

const QUEUE_KEY = "geofield_offline_queue";
export const QUEUE_UPDATED_EVENT = "offline-queue-updated";

export function getQueue(includeDeleted = false): QueuedSample[] {
  return readDurableArray<QueuedSample>(QUEUE_KEY).filter((item) => includeDeleted || !item.deletedAt);
}

export function setQueue(queue: QueuedSample[]) {
  writeDurableArray(QUEUE_KEY, queue);
  window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT));
}

export function enqueue(payload: QueuedSample["payload"], targetId?: string, baseUpdatedAt?: string): QueuedSample {
  const existing = targetId ? getQueue(true).find((item) => item.targetId === targetId) : undefined;
  if (existing) { updateQueuedSample(existing.queuedId, payload); return { ...existing, payload }; }
  const item: QueuedSample = {
    targetId,
    baseUpdatedAt,
    queuedId: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    queuedAt: new Date().toISOString(),
    payload,
  };
  setQueue([...getQueue(true), item]);
  return item;
}

export function updateQueuedSample(queuedId: string, payload: QueuedSample["payload"]) {
  const current = getQueue(true);
  if (!current.some((item) => item.queuedId === queuedId)) {
    enqueue(payload, queuedId);
    return;
  }
  setQueue(
    current.map((item) =>
      item.queuedId === queuedId
        ? { ...item, payload }
        : item
    )
  );
}

export function removeFromQueue(queuedId: string) {
  setQueue(getQueue(true).filter((q) => q.queuedId !== queuedId));
}

export function deleteQueuedSample(queuedId: string) {
  setQueue(getQueue(true).map((item) => item.queuedId === queuedId ? { ...item, deletedAt: new Date().toISOString() } : item));
}

/** Repair a link even if storage failed after the dataset's cloud ID was saved. */
export function reconcileQueuedDatasetIds(datasets: Array<{ id: number | string; cloudId?: string }>) {
  const ids = new Map(datasets.filter((item) => item.cloudId).map((item) => [String(item.id), item.cloudId!]));
  let changed = false;
  const queue = getQueue(true).map((item) => {
    const cloudId = ids.get(String(item.payload.folderId));
    if (!cloudId) return item;
    changed = true;
    return { ...item, payload: { ...item.payload, folderId: cloudId } };
  });
  if (changed) setQueue(queue);
}
