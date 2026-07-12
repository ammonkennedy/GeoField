export interface QueuedSample {
  queuedId: string;
  queuedAt: string;
  payload: {
    sampleType: string;
    sampleId: string;
    folderId: number | string | null;
    notes?: string;
    fields: Record<string, any>;
  };
}
import { readDurableArray, writeDurableArray } from "@/lib/durable-storage";

const QUEUE_KEY = "geofield_offline_queue";
export const QUEUE_UPDATED_EVENT = "offline-queue-updated";

export function getQueue(): QueuedSample[] {
  return readDurableArray<QueuedSample>(QUEUE_KEY);
}

export function setQueue(queue: QueuedSample[]) {
  writeDurableArray(QUEUE_KEY, queue);
  window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT));
}

export function enqueue(payload: QueuedSample["payload"]): QueuedSample {
  const item: QueuedSample = {
    queuedId: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    queuedAt: new Date().toISOString(),
    payload,
  };
  setQueue([...getQueue(), item]);
  return item;
}

export function updateQueuedSample(queuedId: string, payload: QueuedSample["payload"]) {
  setQueue(
    getQueue().map((item) =>
      item.queuedId === queuedId
        ? { ...item, payload }
        : item
    )
  );
}

export function removeFromQueue(queuedId: string) {
  setQueue(getQueue().filter((q) => q.queuedId !== queuedId));
}
