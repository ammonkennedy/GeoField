import assert from "node:assert/strict";
import { test } from "node:test";
import { syncMeasurementRecords } from "../src/lib/sync-measurements.ts";

type Record = { id: string; measurementType: string; datasetId: string | null; updatedAt: string; localRevision?: string; photo?: string; notes?: string; elevation?: number | null; elevationAccuracy?: number | null };
const base: Record = { id: "m", measurementType: "plane", datasetId: "dataset-a", updatedAt: "2026-09-17T10:00:00Z", localRevision: "edit-1", photo: "local-photo" };
function setup(initial = base) {
  let local = [{ ...initial }];
  let remote: Record = { ...base, datasetId: null, updatedAt: "2026-09-17T12:00:00Z", localRevision: undefined, photo: undefined };
  const writes: Record[] = [];
  const store = {
    load: () => structuredClone(local),
    save: (records: Record[]) => { local = structuredClone(records); },
    list: async () => [structuredClone(remote)],
    create: async (item: Record) => { writes.push(item); return { ...item, updatedAt: remote.updatedAt }; },
    update: async (item: Record) => { writes.push(item); return { ...item, updatedAt: remote.updatedAt }; },
  };
  return { store, writes, local: () => local, setLocal: (records: Record[]) => { local = records; }, setRemote: (record: Record) => { remote = record; } };
}
for (const measurementType of ["plane", "lineation"]) {
  test(`${measurementType}: pending assignment uploads despite newer cloud timestamp; stale list cannot clear it`, async () => {
    const scenario = setup({ ...base, measurementType });
    await syncMeasurementRecords(scenario.store);
    assert.equal(scenario.writes.length, 1);
    assert.equal(scenario.writes[0].localRevision, undefined);
    assert.equal(scenario.local()[0].datasetId, "dataset-a");
    assert.equal(scenario.local()[0].localRevision, undefined);
    assert.equal(scenario.local()[0].photo, "local-photo");
    // Reopening the dataset starts another sync: even an equal-timestamp stale
    // listing must not undo the assignment that AWS already acknowledged.
    await syncMeasurementRecords(scenario.store);
    assert.equal(scenario.local()[0].datasetId, "dataset-a");
  });
}
test("failed upload preserves assignment and durable pending revision for retry", async () => {
  const scenario = setup();
  scenario.store.update = async () => { throw new Error("network failure"); };
  await assert.rejects(syncMeasurementRecords(scenario.store), /network/);
  assert.deepEqual(scenario.local(), [base]);
});
test("AWS returning a missing dataset assignment does not acknowledge or erase the local edit", async () => {
  const scenario = setup();
  scenario.store.update = async (item) => ({ ...item, datasetId: null });
  await assert.rejects(syncMeasurementRecords(scenario.store), /did not confirm/);
  assert.deepEqual(scenario.local(), [base]);
});
test("an edit made during upload remains pending and uploads on the next pass", async () => {
  const scenario = setup();
  const update = scenario.store.update;
  scenario.store.update = async (item) => {
    scenario.setLocal([{ ...base, datasetId: "dataset-b", localRevision: "edit-2", notes: "new notes" }]);
    return update(item);
  };
  await syncMeasurementRecords(scenario.store);
  assert.equal(scenario.local()[0].localRevision, "edit-2");
  assert.equal(scenario.local()[0].datasetId, "dataset-b");
  scenario.store.update = update;
  await syncMeasurementRecords(scenario.store);
  assert.equal(scenario.writes[1].datasetId, "dataset-b");
  assert.equal(scenario.local()[0].localRevision, undefined);
  assert.equal(scenario.local()[0].notes, "new notes");
});
test("deleting during upload does not resurrect the record", async () => {
  const scenario = setup();
  scenario.store.update = async (item) => { scenario.setLocal([]); return item; };
  await syncMeasurementRecords(scenario.store);
  assert.deepEqual(scenario.local(), []);
});
test("clean records still accept newer edits from another device", async () => {
  const scenario = setup({ ...base, localRevision: undefined });
  scenario.setRemote({ ...base, datasetId: "other-device", localRevision: undefined, updatedAt: "2026-09-18T12:00:00Z" });
  await syncMeasurementRecords(scenario.store);
  assert.equal(scenario.writes.length, 0);
  assert.equal(scenario.local()[0].datasetId, "other-device");
});

 test("elevation and its accuracy survive upload and subsequent stale download", async () => {
  const scenario = setup({ ...base, elevation: -12.5, elevationAccuracy: 4 });
  await syncMeasurementRecords(scenario.store);
  await syncMeasurementRecords(scenario.store);
  assert.equal(scenario.writes[0].elevation, -12.5);
  assert.equal(scenario.local()[0].elevation, -12.5);
  assert.equal(scenario.local()[0].elevationAccuracy, 4);
});
