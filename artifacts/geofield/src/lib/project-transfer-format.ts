import type { Sample } from "@workspace/api-client-react";
import type { StrikeDipMeasurement } from "./strike-dip-measurements.ts";
import type { WalkingTrack } from "./tracks.ts";
import type { Trip } from "./trips.ts";
import type { Stereonet } from "./stereonet/model.ts";

export const PROJECT_BUNDLE_MIME = "application/vnd.geofield.project+json";
const MAX_PROJECT_BUNDLE_BYTES = 250 * 1024 * 1024;
export const BUNDLE_KIND = "geofield-project";
export const BUNDLE_VERSION = 1;

export type BundledMedia = { id: string; kind: "photo" | "video"; fileName: string; mimeType: string; dataUrl: string };
export type BundledSample = { sourceRecordId: string; sourceTargetId?: string; sampleType: string; sampleId: string; notes?: string | null; fields: Record<string, any> };
export interface ProjectBundle {
  kind: typeof BUNDLE_KIND;
  version: typeof BUNDLE_VERSION;
  exportedAt: string;
  project: { name: string; description: string };
  samples: BundledSample[];
  measurements: Array<Omit<StrikeDipMeasurement, "id" | "localRevision" | "cloudUpdatedAt" | "deletedAt" | "datasetId" | "photo" | "photoKey" | "photoLocalKey" | "photoUploadId" | "photoUploadOnly"> & { sourceRecordId: string; photoMediaId?: string }>;
  tracks: WalkingTrack[];
  trips: Trip[];
  stereonets: Stereonet[];
  media: BundledMedia[];
}

export function validateProjectBundle(value: unknown): ProjectBundle {
  const bundle = value as ProjectBundle;
  if (!bundle || bundle.kind !== BUNDLE_KIND || bundle.version !== BUNDLE_VERSION ||
    typeof bundle.project?.name !== "string" || !bundle.project.name.trim() ||
    !Array.isArray(bundle.samples) || !Array.isArray(bundle.measurements) || !Array.isArray(bundle.tracks) ||
    !Array.isArray(bundle.trips) || !Array.isArray(bundle.stereonets) || !Array.isArray(bundle.media)) {
    throw new Error("This file is not a supported GeoField project share.");
  }
  const mediaIds = new Set<string>();
  for (const item of bundle.media) {
    if (!item || typeof item.id !== "string" || mediaIds.has(item.id) || typeof item.dataUrl !== "string" ||
      !/^data:[^;,]+;base64,[A-Za-z0-9+/=\r\n]+$/.test(item.dataUrl) || !["photo", "video"].includes(item.kind)) {
      throw new Error("A project attachment could not be verified. No data was imported.");
    }
    mediaIds.add(item.id);
  }
  for (const sample of bundle.samples) {
    if (!sample || typeof sample.sourceRecordId !== "string" || typeof sample.sampleType !== "string" || typeof sample.sampleId !== "string" || !sample.fields || typeof sample.fields !== "object") {
      throw new Error("A project sample could not be verified. No data was imported.");
    }
    for (const attachment of Array.isArray(sample.fields.media) ? sample.fields.media : []) {
      if (typeof attachment.shareMediaId !== "string" || !mediaIds.has(attachment.shareMediaId)) throw new Error("A sample attachment is missing from this project file.");
    }
  }
  for (const measurement of bundle.measurements) {
    if (!measurement || typeof measurement.sourceRecordId !== "string" || typeof measurement.label !== "string" || (measurement.photoMediaId && !mediaIds.has(measurement.photoMediaId))) {
      throw new Error("A structural measurement could not be verified. No data was imported.");
    }
  }
  if (new Blob([JSON.stringify(bundle)]).size > MAX_PROJECT_BUNDLE_BYTES) throw new Error("This project file exceeds the 250 MB import limit.");
  return bundle;
}
