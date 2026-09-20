import { uploadSampleMedia, resolveSampleMediaUrl } from "@workspace/api-client-react";
import { getStoredMediaDataUrl, storeMediaDataUrl } from "./media-storage";
import type { QueuedSample } from "./offline-queue";

export async function prepareSampleUpload(item: QueuedSample, accountId: string) {
  const fields = { ...item.payload.fields };
  if (!Array.isArray(fields.media)) return item.payload;
  const media = [];
  for (const attachment of fields.media) {
    if (attachment.storageKey?.startsWith("media/")) {
      const { dataUrl: _url, cloudUrl: _signed, ...metadata } = attachment;
      media.push(metadata);
      continue;
    }
    const localKey = attachment.localKey || attachment.storageKey;
    const dataUrl = localKey ? await getStoredMediaDataUrl(localKey) : attachment.dataUrl;
    if (!dataUrl) throw new Error("A sample photo or video is unavailable on this device. Your sample remains saved locally; its cloud copy has not been replaced.");
    const uploaded = await uploadSampleMedia({
      sampleId: item.targetId ?? item.queuedId,
      localUri: dataUrl,
      fileName: `${attachment.id || localKey || media.length}-${attachment.fileName || "attachment"}`,
      mimeType: attachment.mimeType || "application/octet-stream",
      expectedAccountId: accountId,
    });
    const { dataUrl: _url, cloudUrl: _signed, ...metadata } = attachment;
    media.push({ ...metadata, localKey, storageKey: uploaded.storageKey, syncStatus: "synced" });
  }
  fields.media = media;
  fields.primaryPhoto = media.find((photo) => (photo.kind || photo.type) === "photo") ?? null;
  return { ...item.payload, fields };
}

/** Refresh device-local photo copies without persisting expiring signed URLs. */
export async function cacheSamplePhotos(sample: any) {
  if (!Array.isArray(sample.fields?.media)) return sample;
  const media = [];
  for (const attachment of sample.fields.media) {
    if ((attachment.kind || attachment.type) !== "photo" || !attachment.storageKey?.startsWith("media/")) { media.push(attachment); continue; }
    if (attachment.localKey && await getStoredMediaDataUrl(attachment.localKey)) { media.push(attachment); continue; }
    const url = attachment.cloudUrl || await resolveSampleMediaUrl(attachment.storageKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Network error downloading sample photos. Local samples remain available; photos will retry.");
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const stored = await storeMediaDataUrl({ kind: "photo", dataUrl, fileName: attachment.fileName, mimeType: blob.type });
    media.push({ ...attachment, localKey: stored.storageKey });
  }
  return { ...sample, fields: { ...sample.fields, media, primaryPhoto: media.find((item) => (item.kind || item.type) === "photo") ?? sample.fields.primaryPhoto } };
}
