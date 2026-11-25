import type { Sample } from "@workspace/api-client-react";
import { getLocalDatasets, createLocalDataset } from "./local-datasets.ts";
import { getQueue, setQueue, type QueuedSample } from "./offline-queue.ts";
import { loadMeasurements, saveMeasurements, type StrikeDipMeasurement } from "./strike-dip-measurements.ts";
import { loadTracks, storeTracks, trackingStatus, type WalkingTrack } from "./tracks.ts";
import { loadTrips, saveTrips, type Trip } from "./trips.ts";
import { loadStereonets, storeStereonets } from "./stereonet/storage.ts";
import { stereonetInDataset } from "./stereonet/dataset-association.ts";
import type { Stereonet } from "./stereonet/model.ts";
import { getStoredMediaDataUrl, storeMediaDataUrl } from "./media-storage.ts";
import { resolveSampleMediaUrl } from "@workspace/api-client-react";
import { assertStorageAccount } from "./storage-account.ts";
import { shareFile } from "./save-file.ts";
import { BUNDLE_KIND, BUNDLE_VERSION, PROJECT_BUNDLE_MIME, validateProjectBundle, type ProjectBundle, type BundledMedia, type BundledSample } from "./project-transfer-format.ts";
export { PROJECT_BUNDLE_MIME, validateProjectBundle, type ProjectBundle } from "./project-transfer-format.ts";

const MAX_PROJECT_BUNDLE_BYTES = 250 * 1024 * 1024;

function recordMatchesProject(value: unknown, projectIds: Set<string>) {
  return value !== undefined && value !== null && projectIds.has(String(value));
}

async function mediaAsDataUrl(item: any, accountId: string): Promise<string> {
  if (typeof item?.dataUrl === "string" && item.dataUrl.startsWith("data:")) return item.dataUrl;
  if (typeof item?.photo === "string" && item.photo.startsWith("data:")) return item.photo;
  const keys = [item?.localKey, item?.storageKey, item?.photoLocalKey, item?.photoKey].filter((key): key is string => typeof key === "string" && !!key);
  for (const key of keys) {
    const local = await getStoredMediaDataUrl(key);
    assertStorageAccount(accountId);
    if (local) return local;
    if (key.startsWith("media/")) {
      const response = await fetch(await resolveSampleMediaUrl(key), { signal: AbortSignal.timeout(30000) });
      assertStorageAccount(accountId);
      if (!response.ok) throw new Error("A project attachment could not be downloaded. Nothing was shared; sync and retry.");
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
  }
  for (const url of [item?.dataUrl, item?.photo]) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assertStorageAccount(accountId);
    if (response.ok) {
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
  }
  throw new Error(`The attachment "${item?.fileName || item?.id || "unnamed"}" is unavailable on this device. Nothing was shared.`);
}

function dataUrlMime(dataUrl: string, fallback: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] || fallback || "application/octet-stream";
}

export async function buildProjectBundle(input: {
  project: { id: number | string; name: string; description?: string | null };
  samples: Sample[];
  measurements: StrikeDipMeasurement[];
  accountId: string;
}): Promise<ProjectBundle> {
  assertStorageAccount(input.accountId);
  const identities = getLocalDatasets(true);
  const projectIds = new Set([String(input.project.id)]);
  for (const identity of identities) {
    if (String(identity.id) === String(input.project.id) || identity.cloudId === String(input.project.id) || identity.syncId === String(input.project.id)) {
      projectIds.add(String(identity.id));
      if (identity.cloudId) projectIds.add(identity.cloudId);
      if (identity.syncId) projectIds.add(identity.syncId);
    }
  }
  const samples = input.samples.filter(sample => recordMatchesProject(sample.folderId, projectIds));
  const measurements = input.measurements.filter(item => recordMatchesProject(item.datasetId, projectIds));
  const tracks = loadTracks().filter(track => recordMatchesProject(track.datasetId, projectIds));
  if (tracks.some(track => track.id === trackingStatus().activeId)) throw new Error("Stop this project’s active track before sharing it.");
  const trips = loadTrips().filter(trip => recordMatchesProject(trip.datasetId, projectIds) || recordMatchesProject(trip.cloudDatasetId, projectIds));
  const stereonets = loadStereonets().filter(net => stereonetInDataset(net, input.project.id, identities));
  const media: BundledMedia[] = [];
  const nextMedia = async (item: any, kind: "photo" | "video"): Promise<string> => {
    const dataUrl = await mediaAsDataUrl(item, input.accountId);
    const id = crypto.randomUUID();
    media.push({ id, kind, fileName: String(item.fileName || `${kind}-${id}`), mimeType: dataUrlMime(dataUrl, String(item.mimeType || "")), dataUrl });
    return id;
  };
  const bundledSamples: BundledSample[] = [];
  for (const sample of samples) {
    const sourceTargetId = (sample as Sample & { targetId?: string | number }).targetId;
    const fields = structuredClone((sample.fields || {}) as Record<string, any>);
    if (Array.isArray(fields.media)) {
      fields.media = await Promise.all(fields.media.map(async (attachment: any) => {
        const kind = attachment.kind === "video" || attachment.type === "video" ? "video" : "photo";
        const { dataUrl: _dataUrl, cloudUrl: _cloudUrl, localKey: _localKey, ...metadata } = attachment;
        return { ...metadata, shareMediaId: await nextMedia(attachment, kind) };
      }));
      const primary = fields.media.find((item: any) => item.kind === "photo" || item.type === "photo");
      fields.primaryPhoto = primary ?? null;
    }
    bundledSamples.push({ sourceRecordId: String(sample.id), ...(sourceTargetId ? { sourceTargetId: String(sourceTargetId) } : {}), sampleType: sample.sampleType, sampleId: sample.sampleId, notes: sample.notes, fields });
  }
  const bundledMeasurements: ProjectBundle["measurements"] = [];
  for (const measurement of measurements) {
    const { id: _id, localRevision: _localRevision, cloudUpdatedAt: _cloudUpdatedAt, deletedAt: _deletedAt, datasetId: _datasetId,
      photo, photoKey, photoLocalKey, photoUploadId: _photoUploadId, photoUploadOnly: _photoUploadOnly, ...metadata } = measurement;
    const hasPhoto = Boolean(photo || photoKey || photoLocalKey);
    bundledMeasurements.push({ ...metadata, sourceRecordId: measurement.id, ...(hasPhoto ? { photoMediaId: await nextMedia({ id: measurement.id, fileName: measurement.photoCaption || `${measurement.label || "measurement"}-photo.jpg`, mimeType: "image/jpeg", photo, photoKey, photoLocalKey }, "photo") } : {}) });
  }
  assertStorageAccount(input.accountId);
  const bundle: ProjectBundle = {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: input.project.name, description: input.project.description || "" },
    samples: bundledSamples,
    measurements: bundledMeasurements,
    tracks: tracks.map(({ localRevision: _localRevision, cloudRevision: _cloudRevision, ...track }) => track),
    trips: trips.map(({ localRevision: _localRevision, cloudUpdatedAt: _cloudUpdatedAt, ...trip }) => trip),
    stereonets: stereonets.map(({ localRevision: _localRevision, cloudRevision: _cloudRevision, ...net }) => net),
    media,
  };
  if (new Blob([JSON.stringify(bundle)]).size > MAX_PROJECT_BUNDLE_BYTES) throw new Error("This project is larger than the 250 MB sharing limit.");
  return bundle;
}

export async function importProjectBundle(value: unknown, accountId: string) {
  assertStorageAccount(accountId);
  const bundle = validateProjectBundle(value);
  const mediaById = new Map<string, BundledMedia>();
  const importedMedia = new Map<string, string>();
  for (const media of bundle.media) {
    const stored = await storeMediaDataUrl({ kind: media.kind, dataUrl: media.dataUrl, fileName: media.fileName, mimeType: media.mimeType });
    assertStorageAccount(accountId);
    mediaById.set(media.id, media);
    importedMedia.set(media.id, stored.storageKey);
  }
  const dataset = createLocalDataset({ name: bundle.project.name, description: bundle.project.description });
  const now = new Date().toISOString();
  const importedSamples: QueuedSample[] = bundle.samples.map(sample => {
    const fields = structuredClone(sample.fields);
    if (Array.isArray(fields.media)) {
      fields.media = fields.media.map((attachment: any) => {
        const storedKey = importedMedia.get(attachment.shareMediaId);
        const source = mediaById.get(attachment.shareMediaId)!;
        const { shareMediaId: _shareMediaId, ...metadata } = attachment;
        return { ...metadata, id: crypto.randomUUID(), kind: source.kind, type: source.kind, fileName: source.fileName, mimeType: source.mimeType, localKey: storedKey, storageKey: storedKey, syncStatus: "local" };
      });
      fields.primaryPhoto = fields.media.find((item: any) => item.kind === "photo") ?? null;
    }
    return { queuedId: `q_${crypto.randomUUID()}`, queuedAt: now, payload: { sampleType: sample.sampleType, sampleId: sample.sampleId, folderId: dataset.id, notes: sample.notes ?? undefined, fields } };
  });
  const importedSampleIds = new Map<string, string>();
  bundle.samples.forEach((sample, index) => {
    importedSampleIds.set(sample.sourceRecordId, importedSamples[index].queuedId);
    if (sample.sourceTargetId) importedSampleIds.set(sample.sourceTargetId, importedSamples[index].queuedId);
  });
  const importedRecordIds = new Map(importedSampleIds);
  const measurements = bundle.measurements.map(measurement => {
    const { photoMediaId, sourceRecordId, ...metadata } = measurement;
    const photoLocalKey = photoMediaId ? importedMedia.get(photoMediaId) : undefined;
    const media = photoMediaId ? mediaById.get(photoMediaId) : undefined;
    const id = crypto.randomUUID();
    importedRecordIds.set(sourceRecordId, id);
    return { ...metadata, id, datasetId: dataset.id, ...(photoLocalKey ? { photoLocalKey, photoCaption: media?.fileName, photoUploadId: crypto.randomUUID() } : {}), localRevision: crypto.randomUUID(), cloudUpdatedAt: undefined, deletedAt: undefined } as StrikeDipMeasurement;
  });
  const tracks = bundle.tracks.map(track => ({ ...track, id: crypto.randomUUID(), datasetId: dataset.id, visible: true, localRevision: crypto.randomUUID(), cloudRevision: undefined, deletedAt: undefined }));
  const trips = bundle.trips.map(trip => ({ ...trip, id: crypto.randomUUID(), sites: trip.sites.map(site => ({ ...site, queuedSampleId: site.queuedSampleId ? importedSampleIds.get(site.queuedSampleId) : undefined })), datasetId: dataset.id, cloudDatasetId: null, localRevision: crypto.randomUUID(), cloudUpdatedAt: undefined, deletedAt: undefined }));
  const stereonets = bundle.stereonets.map(net => {
    const groupIds = new Map(net.groups.map(group => [group.id, crypto.randomUUID()]));
    return {
      ...net,
      id: crypto.randomUUID(),
      savedDatasetId: String(dataset.id),
      groups: net.groups.map(group => ({ ...group, id: groupIds.get(group.id)!, sourceDatasetId: String(dataset.id) })),
      measurements: net.measurements.map(item => ({ ...item, id: crypto.randomUUID(), groupId: groupIds.get(item.groupId)!, sourceId: item.sourceId ? importedRecordIds.get(item.sourceId) ?? item.sourceId : undefined, raw: { ...item.raw, datasetId: dataset.id } })),
      localRevision: crypto.randomUUID(),
      cloudRevision: undefined,
      deletedAt: undefined,
    };
  });
  assertStorageAccount(accountId);
  await storeTracks(tracks);
  setQueue([...getQueue(true), ...importedSamples]);
  saveMeasurements([...loadMeasurements(true), ...measurements]);
  saveTrips([...loadTrips(true), ...trips]);
  storeStereonets([...loadStereonets(true), ...stereonets]);
  assertStorageAccount(accountId);
  return dataset;
}

export async function shareProjectBundle(bundle: ProjectBundle, filename: string) {
  const file = new Blob([JSON.stringify(bundle)], { type: PROJECT_BUNDLE_MIME });
  return shareFile(file, filename, bundle.project.name);
}

export async function readProjectBundleFile(file: File): Promise<ProjectBundle> {
  if (file.size > MAX_PROJECT_BUNDLE_BYTES) throw new Error("This project file exceeds the 250 MB import limit.");
  let value: unknown;
  try { value = JSON.parse(await file.text()); }
  catch { throw new Error("This file could not be read as a GeoField project share."); }
  return validateProjectBundle(value);
}