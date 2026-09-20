import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

export interface PlannedSite {
  id: string;
  name: string;
  description: string;
  sampleType?: "water" | "rock" | "soil_sand" | "air" | "other";
  lat: number;
  lng: number;
  addedAt: string;
  queuedSampleId?: string;
  collectedAt?: string;
}
export interface Trip {
  id: string;
  name: string;
  notes: string;
  sites: PlannedSite[];
  createdAt: string;
  updatedAt: string;
  datasetId?: number;
  cloudDatasetId?: string | null;
  localRevision?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string | null;
}
export const TRIPS_UPDATED = "trips-updated";
const KEY = "geofield_trips";
export function loadTrips(includeDeleted = false): Trip[] {
  const trips = readDurableArray<Trip>(KEY);
  // Previously local-only trips must upload once, including trips with no sites.
  const migrated = trips.map((trip) =>
    !trip.localRevision && !trip.cloudUpdatedAt
      ? { ...trip, localRevision: crypto.randomUUID() }
      : trip,
  );
  if (migrated.some((trip, i) => trip !== trips[i]))
    writeDurableArray(KEY, migrated);
  return migrated.filter((trip) => includeDeleted || !trip.deletedAt);
}
export function storeTrips(trips: Trip[]) {
  writeDurableArray(KEY, trips);
  window.dispatchEvent(new Event(TRIPS_UPDATED));
}
/** Merge explicit edits into current storage; an omitted trip is not a deletion. */
export function saveTrips(trips: Trip[]) {
  const current = loadTrips(true);
  const next = new Map(current.map((trip) => [trip.id, trip]));
  for (const trip of trips) {
    const previous = next.get(trip.id);
    if (JSON.stringify(previous) === JSON.stringify(trip)) continue;
    next.set(trip.id, {
      ...trip,
      cloudUpdatedAt: previous?.cloudUpdatedAt,
      localRevision: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
  }
  storeTrips([...next.values()]);
}
export function deleteTripRecord(id: string) {
  const trip = loadTrips().find((item) => item.id === id);
  if (trip) saveTrips([{ ...trip, deletedAt: new Date().toISOString() }]);
}
