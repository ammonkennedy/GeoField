import assert from "node:assert/strict";
import { test } from "node:test";
import { syncTripRecords, type SyncTrip } from "../src/lib/trip-sync.ts";
const trip = (changes: Partial<SyncTrip> = {}): SyncTrip => ({ id: "trip", name: "Outcrops", notes: "Take water", sites: [{ id: "site", name: "Spring", description: "", lat: 40, lng: -110, addedAt: "2026-09-20T10:00:00Z" }], datasetId: "dataset-cloud", createdAt: "2026-09-20T10:00:00Z", updatedAt: "2026-09-20T10:00:00Z", localRevision: "pending", ...changes });
function setup(initial: SyncTrip[] = [trip()], cloud: SyncTrip[] = []) {
  let local = structuredClone(initial);
  const remote = new Map(cloud.map((item) => [item.id, structuredClone(item)]));
  const store = {
    load: () => structuredClone(local), save: (items: SyncTrip[]) => { local = structuredClone(items); },
    list: async () => structuredClone([...remote.values()]), get: async (id: string) => structuredClone(remote.get(id) ?? null),
    write: async (item: SyncTrip, exists: boolean) => {
      if (!exists && remote.has(item.id)) throw new Error("Already exists");
      const saved = { ...item, localRevision: undefined, updatedAt: "2026-09-20T12:00:00Z" };
      remote.set(item.id, saved); return structuredClone(saved);
    },
  };
  return { store, remote };
}
test("trip details and sites upload and download to a second device", async () => {
  const a = setup(); await syncTripRecords(a.store);
  assert.equal(a.store.load()[0].localRevision, undefined);
  const b = setup([], [...a.remote.values()]); await syncTripRecords(b.store);
  assert.equal(b.store.load()[0].datasetId, "dataset-cloud");
  assert.deepEqual(b.store.load()[0].sites, trip().sites);
  assert.equal(b.store.load()[0].notes, "Take water");
});
test("lost trip response is acknowledged without duplicating the trip", async () => {
  const s = setup(); const write = s.store.write;
  s.store.write = async (item, exists) => { await write(item, exists); throw new Error("Network lost"); };
  await syncTripRecords(s.store); assert.equal(s.remote.size, 1); assert.equal(s.store.load()[0].localRevision, undefined);
});
test("in-flight trip edits stay pending after the earlier version uploads", async () => {
  const s = setup(); const write = s.store.write;
  s.store.write = async (item, exists) => { s.store.save([trip({ notes: "New text", localRevision: "later" })]); return write(item, exists); };
  await syncTripRecords(s.store);
  assert.equal(s.store.load()[0].notes, "New text"); assert.equal(s.store.load()[0].localRevision, "later");
});
test("another device's trip edit is preserved as a recovery copy", async () => {
  const s = setup([trip({ cloudUpdatedAt: "older" })], [trip({ notes: "Other device", localRevision: undefined })]);
  await syncTripRecords(s.store);
  assert.equal(s.remote.size, 2);
  assert.ok([...s.remote.values()].some((item) => item.id !== "trip" && item.notes === "Other device"));
});
test("trip deletion propagates without inferring deletion from a missing listing", async () => {
  const deleted = trip({ deletedAt: "2026-09-20T12:00:00Z", updatedAt: "2026-09-20T12:00:00Z", localRevision: undefined });
  const s = setup([trip({ localRevision: undefined, cloudUpdatedAt: trip().updatedAt })], [deleted]);
  await syncTripRecords(s.store); assert.ok(s.store.load()[0].deletedAt);
  s.remote.clear(); await syncTripRecords(s.store); assert.equal(s.store.load().length, 1);
});
test("one failed trip does not block another, and unacknowledged fields remain pending", async () => {
  const s = setup([trip(), trip({ id: "second" })]); const write = s.store.write;
  s.store.write = async (item, exists) => item.id === "trip" ? { ...item, sites: [] } : write(item, exists);
  await assert.rejects(syncTripRecords(s.store), /confirm all trip details/);
  assert.equal(s.store.load()[0].localRevision, "pending"); assert.equal(s.store.load()[1].localRevision, undefined);
});
test("a local dataset ID is never sent to another device", async () => {
  const s = setup([trip({ datasetId: "-123" })]);
  await assert.rejects(syncTripRecords(s.store), /dataset link is still waiting/);
  assert.equal(s.remote.size, 1); assert.equal(s.remote.get("trip")?.datasetId, null);
  assert.equal(s.store.load()[0].datasetId, "-123"); assert.equal(s.store.load()[0].localRevision, "pending");
  const other = setup([], [...s.remote.values()]); await syncTripRecords(other.store);
  assert.deepEqual(other.store.load()[0].sites, trip().sites);
  s.store.save(s.store.load().map((item) => ({ ...item, datasetId: "resolved-cloud" })));
  await syncTripRecords(s.store); assert.equal(s.remote.get("trip")?.datasetId, "resolved-cloud");
  assert.equal(s.store.load()[0].localRevision, undefined);
});

test("a pending trip dataset link never clears its existing cloud assignment", async () => {
  const s = setup([trip({ datasetId: "-123" })], [trip({ localRevision: undefined })]);
  await assert.rejects(syncTripRecords(s.store), /dataset link/);
  assert.equal(s.remote.get("trip")?.datasetId, "dataset-cloud"); assert.equal(s.remote.size, 1);
});
