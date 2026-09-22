import { normalizeLineationRecord } from "./lineation-record.ts";
import { reassignMeasurementRecords, type DatasetIdentity } from "./dataset-identity.ts";
export interface StrikeDipMeasurement {
  id: string;
  localRevision?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string | null;
  measurementType?: "plane" | "lineation";
  label: string;
  strike: string;
  dip: string;
  dipDir: string;
  strikeDegrees?: number;
  dipDegrees?: number;
  dipDirectionDegrees?: number;
  trendDegrees?: number;
  plungeDegrees?: number;
  lineVector?: { east: number; north: number; up: number };
  convention?: "right-hand-rule";
  northReference?: "true" | "magnetic";
  compassAccuracy?: number;
  magneticHeading?: number;
  trueHeading?: number;
  magneticDeclination?: number;
  referenceFrame?: "true" | "magnetic";
  rawMagneticStrikeDegrees?: number;
  orientationQuaternion?: { x: number; y: number; z: number; w: number };
  planeNormal?: { east: number; north: number; up: number };
  quality?: "stable" | "manual" | "unstable";
  location: string;
  date: string;
  featureType: string;
  rockLayerType: string;
  datasetId?: number | string | null;
  notes: string;
  photo?: string;
  photoKey?: string | null;
  photoLocalKey?: string;
  photoUploadId?: string;
  photoUploadOnly?: boolean;
  createdAt?: string;
  updatedAt?: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  elevation?: number | null;
  elevationAccuracy?: number | null;
  utmEasting?: number;
  utmNorthing?: number;
  utmZone?: string;
}
import { readDurableArray, writeDurableArray } from "./durable-storage.ts";
import { archiveLocalItem, getLocalDeletedItems, removeLocalDeletedItem, type LocalDeletedItem } from "./recently-deleted.ts";

const KEY = "geofield_strike_dip";
export const STRIKE_DIP_UPDATED_EVENT = "strike-dip-updated";

export function loadMeasurements(includeDeleted = false): StrikeDipMeasurement[] {
  const stored = readDurableArray<StrikeDipMeasurement>(KEY);
  let migratedLineations = false;
  for (let index = 0; index < stored.length; index++) {
    const original = stored[index];
    const normalized = normalizeLineationRecord(original);
    if (normalized === original) continue;
    stored[index] = { ...normalized, cloudUpdatedAt: original.cloudUpdatedAt ?? (!original.localRevision ? original.updatedAt : undefined), localRevision: crypto.randomUUID(), photoUploadOnly: undefined };
    migratedLineations = true;
  }
  if (migratedLineations) writeDurableArray(KEY, stored);
  let migratedPhotos = false;
  for (const item of stored) {
    if ((item.photo || item.photoLocalKey) && !item.photoKey && !item.photoUploadId) {
      item.photoUploadOnly = !item.localRevision;
      item.photoUploadId = crypto.randomUUID();
      item.localRevision = crypto.randomUUID();
      migratedPhotos = true;
    }
  }
  if (migratedPhotos) writeDurableArray(KEY, stored);
  const ids = new Set(stored.map((item) => item.id));
  const legacyDeletions = getLocalDeletedItems().filter((item) => item.kind === "measurement" && item.data?.id && !ids.has(item.data.id));
  if (legacyDeletions.length) {
    for (const item of legacyDeletions) {
      if (ids.has(item.data.id)) continue;
      stored.push({ ...item.data, deletedAt: item.deletedAt, updatedAt: item.deletedAt, localRevision: crypto.randomUUID() });
      ids.add(item.data.id);
    }
    writeDurableArray(KEY, stored);
  }
  return stored.filter((item) => includeDeleted || !item.deletedAt).map((measurement) => {
    const strikeDegrees = measurement.strikeDegrees ?? Number.parseFloat(measurement.strike);
    const dipDegrees = measurement.dipDegrees ?? Number.parseFloat(measurement.dip);
    const dipDirectionDegrees = measurement.dipDirectionDegrees ?? (Number.isFinite(strikeDegrees) ? ((strikeDegrees + 90) % 360) : undefined);
    return {
      ...measurement,
      strikeDegrees: Number.isFinite(strikeDegrees) ? strikeDegrees : undefined,
      dipDegrees: Number.isFinite(dipDegrees) ? dipDegrees : undefined,
      dipDirectionDegrees,
      convention: measurement.convention ?? "right-hand-rule",
      quality: measurement.quality ?? "manual",
    };
  });
}

export function saveMeasurements(items: StrikeDipMeasurement[], options: { fromSync?: boolean } = {}) {
  const before = loadMeasurements(true);
  if (!options.fromSync) items = [...items, ...before.filter((item) => item.deletedAt && !items.some((next) => next.id === item.id))];
  // A form can still hold a local ID after background dataset creation finishes.
  const datasets = readDurableArray<DatasetIdentity>("geofield_local_datasets");
  for (const dataset of datasets) {
    if (dataset.cloudId) items = reassignMeasurementRecords(items, dataset.id, dataset.cloudId);
  }
  if (!options.fromSync) {
    const previous = new Map(before.map((item) => [item.id, item]));
    items = items.map((item) => {
      const old = previous.get(item.id);
      if (old && (old.photo !== item.photo || old.photoLocalKey !== item.photoLocalKey)) {
        return { ...item, photoKey: null, photoUploadId: item.photo || item.photoLocalKey ? crypto.randomUUID() : undefined };
      }
      return item;
    });
    items = items.map((item) => JSON.stringify(previous.get(item.id)) === JSON.stringify(item)
      ? item : { ...item, photoUploadOnly: undefined, cloudUpdatedAt: item.cloudUpdatedAt ?? (!previous.get(item.id)?.localRevision ? previous.get(item.id)?.updatedAt : undefined), localRevision: crypto.randomUUID() });
  }
  writeDurableArray(KEY, items);
  window.dispatchEvent(new Event(STRIKE_DIP_UPDATED_EVENT));
}

export function deleteMeasurement(id: string) {
  const items = loadMeasurements();
  const measurement = items.find((item) => item.id === id);
  if (!measurement) return;
  archiveLocalItem("measurement", measurement.label || `Measurement ${measurement.strike}/${measurement.dip}`, measurement);
  saveMeasurements(items.map((item) => item.id === id ? { ...item, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item));
}

export function restoreMeasurement(item: LocalDeletedItem) {
  if (item.kind !== "measurement") return;
  const items = loadMeasurements();
  if (!items.some((measurement) => measurement.id === item.data.id)) saveMeasurements([...items, { ...item.data, deletedAt: null, updatedAt: new Date().toISOString() }]);
  removeLocalDeletedItem(item.trashId);
}

export function reassignMeasurementsDataset(fromDatasetId: number | string, toDatasetId: number | string | null) {
  saveMeasurements(reassignMeasurementRecords(loadMeasurements(), fromDatasetId, toDatasetId));
}
