import type { Sample } from "@workspace/api-client-react";
import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

const KEY = "geofield_cloud_samples";
const BACKFILL_KEY = "geofield_cloud_samples_backfill";
export const CLOUD_SAMPLES_UPDATED_EVENT = "cloud-samples-updated";

export function getCachedCloudSamples(): Sample[] {
  return readDurableArray<Sample>(KEY).filter((sample: any) => !sample.deletedAt);
}

export function clearCachedCloudSamples() {
  writeDurableArray<Sample>(KEY, []);
  window.dispatchEvent(new CustomEvent(CLOUD_SAMPLES_UPDATED_EVENT));
}

export function clearCloudBackfill() {
  localStorage.removeItem(BACKFILL_KEY);
}

export function markCloudBackfillComplete(count: number) {
  localStorage.setItem(BACKFILL_KEY, JSON.stringify({ completedAt: new Date().toISOString(), count }));
}

export function needsCloudBackfill(): boolean {
  try {
    const status = JSON.parse(localStorage.getItem(BACKFILL_KEY) || "null");
    return !status?.completedAt || getCachedCloudSamples().length < Number(status.count || 0);
  } catch {
    return true;
  }
}

function timestamp(sample: Sample): number {
  return Date.parse(String(sample.updatedAt || sample.createdAt || "")) || 0;
}

/** Replace the complete cloud snapshot, retaining the newest version for each cloud ID. */
export function cacheCloudSamples(remote: Sample[], replaceMediaCache = false): Sample[] {
  const previous = new Map(readDurableArray<Sample>(KEY).map((sample) => [String(sample.id), sample]));
  for (const sample of remote) {
    const id = String(sample.id);
    const cached = previous.get(id);
    if (!cached || timestamp(sample) >= timestamp(cached)) {
      const media = (sample.fields as any)?.media;
      const cachedMedia = (cached?.fields as any)?.media;
      previous.set(id, Array.isArray(media) ? { ...sample, fields: { ...sample.fields, media: media.map((item: any) => ({ ...item, localKey: replaceMediaCache ? item.localKey : cachedMedia?.find((old: any) => old.storageKey === item.storageKey)?.localKey ?? item.localKey })) } } : sample);
    }
  }
  // An eventually consistent list can omit a just-uploaded record. Only an
  // explicit cloud tombstone is a deletion instruction.
  const merged = [...previous.values()];
  writeDurableArray(KEY, merged);
  window.dispatchEvent(new CustomEvent(CLOUD_SAMPLES_UPDATED_EVENT));
  return merged.filter((sample: any) => !sample.deletedAt);
}

export function mergeCloudAndLocal<T extends { id: string | number }>(cloud: T[], local: T[]): T[] {
  const byId = new Map<string, T>();
  cloud.forEach((item) => byId.set(String(item.id), item));
  local.forEach((item) => {
    if ((item as any).targetId) byId.delete(String((item as any).targetId));
    const existing = byId.get(String(item.id));
    if (!existing || (item as any).isOffline || timestamp(item as any) > timestamp(existing as any)) byId.set(String(item.id), item);
  });
  const deleted = new Map(readDurableArray<Sample>(KEY).filter((item: any) => item.deletedAt).map((item) => [String(item.id), timestamp(item)]));
  return [...byId.values()].filter((item) => (item as any).isOffline || !deleted.has(String(item.id)) || timestamp(item as any) > deleted.get(String(item.id))!);
}
