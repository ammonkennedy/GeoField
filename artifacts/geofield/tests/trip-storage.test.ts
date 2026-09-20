import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTrips, saveTrips, deleteTripRecord } from "../src/lib/trips.ts";
import { loadSyncTrips, storeSyncTrips, reconcileTripSites } from "../src/lib/trip-sync-storage.ts";
import { getPendingLocalDatasets, createTripDataset } from "../src/lib/local-datasets.ts";
import { getQueue, setQueue } from "../src/lib/offline-queue.ts";
function setup() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });
  const account = (id: string) => values.set("geofield-account:pool", JSON.stringify({ user: { id } }));
  account("a"); return { values, account };
}
const trip = { id: "trip", name: "Spring", notes: "Keep", sites: [{ id: "site", name: "Water", description: "Collect", lat: 40, lng: -110, addedAt: "2026-09-20T10:00:00Z" }], createdAt: "2026-09-20T10:00:00Z", updatedAt: "2026-09-20T10:00:00Z" };
test("legacy trips acquire one durable upload revision and remain account isolated", () => {
  const s = setup(); s.values.set("geofield_trips", JSON.stringify([trip]));
  const first = loadTrips(); assert.ok(first[0].localRevision); assert.equal(loadTrips()[0].localRevision, first[0].localRevision);
  s.account("b"); assert.equal(loadTrips().length, 0); s.account("a"); assert.equal(loadTrips()[0].name, "Spring");
});
test("trip deletion is a durable tombstone rather than a missing row", () => {
  setup(); saveTrips([trip]); deleteTripRecord(trip.id);
  assert.equal(loadTrips().length, 0); assert.ok(loadTrips(true)[0].deletedAt); assert.ok(loadTrips(true)[0].localRevision);
});
test("a downloaded trip reuses its cloud dataset and reconstructs planned sites", () => {
  setup(); const remote = { ...trip, datasetId: "cloud-dataset", cloudUpdatedAt: trip.updatedAt };
  storeSyncTrips([remote]); const local = loadTrips()[0];
  assert.ok(local.datasetId! < 0); assert.equal(local.cloudDatasetId, "cloud-dataset");
  assert.equal(getPendingLocalDatasets().length, 0);
  assert.equal(createTripDataset({ tripId: trip.id, name: trip.name, cloudId: "cloud-dataset" }).id, local.datasetId);
  assert.deepEqual(loadSyncTrips(), [remote]);
  reconcileTripSites(); assert.equal(getQueue()[0].payload.folderId, "cloud-dataset");
  reconcileTripSites(); assert.equal(getQueue().length, 1);
});
test("deleting a trip never erases a collected sample waiting for upload", () => {
  setup(); storeSyncTrips([{ ...trip, cloudUpdatedAt: trip.updatedAt }]); reconcileTripSites();
  setQueue(getQueue().map((item) => ({ ...item, payload: { ...item.payload, fields: { ...item.payload.fields, collectionStatus: "collected", important: "data" } } })));
  deleteTripRecord(trip.id); reconcileTripSites();
  assert.equal(getQueue().length, 1); assert.equal(getQueue()[0].payload.fields.important, "data");
});
test("removed or collected sites remove only their planned placeholders", () => {
  setup(); storeSyncTrips([{ ...trip, cloudUpdatedAt: trip.updatedAt }]); reconcileTripSites();
  assert.equal(getQueue().length, 1);
  saveTrips([{ ...loadTrips()[0], sites: [] }]); reconcileTripSites(); assert.equal(getQueue().length, 0);
});

test("an explicit cloud dataset unlink clears the local trip link", () => {
  setup(); storeSyncTrips([{ ...trip, datasetId: "cloud-dataset", cloudUpdatedAt: trip.updatedAt }]);
  storeSyncTrips([{ ...trip, datasetId: null, cloudUpdatedAt: trip.updatedAt }]);
  assert.equal(loadTrips()[0].datasetId, undefined); assert.equal(loadSyncTrips()[0].datasetId, null);
});
