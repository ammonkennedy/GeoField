import type { Sample } from "@workspace/api-client-react";
import { readDurableArray, writeDurableArray } from "@/lib/durable-storage";

const KEY = "geofield_cloud_samples";
export const CLOUD_SAMPLES_UPDATED_EVENT = "cloud-samples-updated";

export function getCachedCloudSamples(): Sample[] {
  return readDurableArray<Sample>(KEY);
}

export function clearCachedCloudSamples() {
  writeDurableArray<Sample>(KEY, []);
  window.dispatchEvent(new CustomEvent(CLOUD_SAMPLES_UPDATED_EVENT));
}

function timestamp(sample: Sample): number {
  return Date.parse(String(sample.updatedAt || sample.createdAt || "")) || 0;
}

/** Replace the complete cloud snapshot, retaining the newest version for each cloud ID. */
export function cacheCloudSamples(remote: Sample[]): Sample[] {
  const previous = new Map(getCachedCloudSamples().map((sample) => [String(sample.id), sample]));
  const merged = remote.map((sample) => {
    const cached = previous.get(String(sample.id));
    return cached && timestamp(cached) > timestamp(sample) ? cached : sample;
  });
  writeDurableArray(KEY, merged);
  window.dispatchEvent(new CustomEvent(CLOUD_SAMPLES_UPDATED_EVENT));
  return merged;
}

export function mergeCloudAndLocal<T extends { id: string | number }>(cloud: T[], local: T[]): T[] {
  const byId = new Map<string, T>();
  cloud.forEach((item) => byId.set(String(item.id), item));
  local.forEach((item) => {
    if (!byId.has(String(item.id))) byId.set(String(item.id), item);
  });
  return [...byId.values()];
}
