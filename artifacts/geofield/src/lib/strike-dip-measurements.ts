export interface StrikeDipMeasurement {
  id: string;
  label: string;
  strike: string;
  dip: string;
  dipDir: string;
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

const KEY = "geofield_strike_dip";
export const STRIKE_DIP_UPDATED_EVENT = "strike-dip-updated";

export function loadMeasurements(): StrikeDipMeasurement[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function saveMeasurements(items: StrikeDipMeasurement[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(STRIKE_DIP_UPDATED_EVENT));
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
