export interface StrikeDipMeasurement {
  id: string;
  label: string;
  strike: string;
  dip: string;
  dipDir: string;
  strikeDegrees?: number;
  dipDegrees?: number;
  dipDirectionDegrees?: number;
  convention?: "right-hand-rule";
  northReference?: "true" | "magnetic";
  compassAccuracy?: number;
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
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  utmEasting?: number;
  utmNorthing?: number;
  utmZone?: string;
}
import { readDurableArray, writeDurableArray } from "@/lib/durable-storage";
import { archiveLocalItem, removeLocalDeletedItem, type LocalDeletedItem } from "@/lib/recently-deleted";

const KEY = "geofield_strike_dip";
export const STRIKE_DIP_UPDATED_EVENT = "strike-dip-updated";

export function loadMeasurements(): StrikeDipMeasurement[] {
  return readDurableArray<StrikeDipMeasurement>(KEY).map((measurement) => {
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

export function saveMeasurements(items: StrikeDipMeasurement[]) {
  writeDurableArray(KEY, items);
  window.dispatchEvent(new Event(STRIKE_DIP_UPDATED_EVENT));
}

export function deleteMeasurement(id: string) {
  const items = loadMeasurements();
  const measurement = items.find((item) => item.id === id);
  if (!measurement) return;
  archiveLocalItem("measurement", measurement.label || `Measurement ${measurement.strike}/${measurement.dip}`, measurement);
  saveMeasurements(items.filter((item) => item.id !== id));
}

export function restoreMeasurement(item: LocalDeletedItem) {
  if (item.kind !== "measurement") return;
  const items = loadMeasurements();
  if (!items.some((measurement) => measurement.id === item.data.id)) saveMeasurements([...items, item.data]);
  removeLocalDeletedItem(item.trashId);
}

export function reassignMeasurementsDataset(fromDatasetId: number | string, toDatasetId: number | string | null) {
  saveMeasurements(
    loadMeasurements().map((measurement) =>
      String(measurement.datasetId ?? "") === String(fromDatasetId)
        ? { ...measurement, datasetId: toDatasetId }
        : measurement
    )
  );
}
