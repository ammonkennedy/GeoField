import type { StrikeDipMeasurement } from "./strike-dip-measurements.ts";
interface PhotoStore {
  read: (key: string) => Promise<string | null>;
  store: (dataUrl: string) => Promise<string>;
  upload: (id: string, uploadId: string, dataUrl: string) => Promise<string>;
  download: (key: string) => Promise<string>;
}
export async function prepareMeasurementPhoto(
  item: StrikeDipMeasurement,
  store: PhotoStore,
): Promise<StrikeDipMeasurement> {
  if (item.photoKey || (!item.photo && !item.photoLocalKey)) return item;
  const dataUrl =
    item.photo ??
    (item.photoLocalKey ? await store.read(item.photoLocalKey) : null);
  if (!dataUrl)
    throw new Error(
      "A measurement photo is unavailable on this device. Your measurement remains pending and the cloud copy is preserved.",
    );
  if (!item.photoUploadId)
    throw new Error(
      "The measurement photo is not ready to upload. Please sync again.",
    );
  // Photo-version IDs keep replacement photos from overwriting another device's file.
  const photoLocalKey = item.photoLocalKey ?? (await store.store(dataUrl));
  const photoKey = await store.upload(item.id, item.photoUploadId, dataUrl);
  return { ...item, photo: undefined, photoLocalKey, photoKey };
}
export async function cacheMeasurementPhoto(
  item: StrikeDipMeasurement,
  store: PhotoStore,
): Promise<StrikeDipMeasurement> {
  if (!item.photoKey || item.deletedAt) return item;
  if (item.photoLocalKey && (await store.read(item.photoLocalKey))) return item;
  const dataUrl = await store.download(item.photoKey);
  const photoLocalKey = await store.store(dataUrl);
  return { ...item, photo: undefined, photoLocalKey };
}
