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

test("cloud deletion is downloaded as a tombstone instead of recreating a measurement", async () => {
 const scenario=setup({...base,localRevision:undefined});
 scenario.setRemote({...base,localRevision:undefined,updatedAt:"2026-09-19T00:00:00Z",deletedAt:"2026-09-19T00:00:00Z"} as any);
 await syncMeasurementRecords(scenario.store);
 assert.equal(scenario.writes.length,0);assert.equal((scenario.local()[0] as any).deletedAt,"2026-09-19T00:00:00Z");
});
test("concurrent edits preserve the other device's measurement before uploading this edit", async () => {
 const scenario=setup({...base,cloudUpdatedAt:"2026-09-17T09:00:00Z"} as any);
 await syncMeasurementRecords(scenario.store);
 assert.equal(scenario.writes.length,2);assert.match(scenario.writes[0].id,/recovered/);assert.equal(scenario.writes[1].id,base.id);
});
test("a later failed measurement does not discard an earlier durable acknowledgment", async () => {
 const scenario=setup(); scenario.setLocal([base,{...base,id:"second",localRevision:"second-edit"}]);
 scenario.store.create=async()=>{throw new Error("Network error on second measurement");};
 await assert.rejects(syncMeasurementRecords(scenario.store),/second measurement/);
 assert.equal(scenario.local()[0].localRevision,undefined);assert.equal(scenario.local()[1].localRevision,"second-edit");
});
test("a failed final download cannot make an acknowledged measurement upload again", async () => {
 const scenario=setup();const list=scenario.store.list;let calls=0;
 scenario.store.list=async()=>{if(++calls===2)throw new Error("download disconnected");return list();};
 await assert.rejects(syncMeasurementRecords(scenario.store),/disconnected/);
 assert.equal(scenario.local()[0].localRevision,undefined);assert.equal(scenario.local()[0].datasetId,"dataset-a");
});
test("an invalid measurement cannot block later valid measurements", async () => {
 const scenario=setup();scenario.setLocal([base,{...base,id:"healthy",localRevision:"healthy-edit"}]);
 scenario.store.update=async()=>{throw new Error("invalid first record");};
 await assert.rejects(syncMeasurementRecords(scenario.store),/invalid first/);
 assert.equal(scenario.local().find((item)=>item.id==="m")?.localRevision,"edit-1");assert.equal(scenario.local().find((item)=>item.id==="healthy")?.localRevision,undefined);
});
test("a stale list omission uses a direct read instead of repeatedly trying to create an existing measurement", async () => {
 const scenario=setup();scenario.store.list=async()=>[];
 let updates=0;await syncMeasurementRecords({...scenario.store,get:async()=>({...base,datasetId:null,localRevision:undefined}),update:async(item)=>{updates++;return item;},create:async()=>{throw new Error("duplicate create");}});
 assert.equal(updates,1);assert.equal(scenario.local()[0].localRevision,undefined);
});
test("a lost measurement write response is confirmed by reading the saved record", async () => {
 const scenario=setup();let cloud:any={...base,datasetId:null,localRevision:undefined};
 await syncMeasurementRecords({...scenario.store,get:async()=>cloud,update:async(item)=>{cloud={...item,updatedAt:"2026-09-20T12:00:00Z"};throw new Error("response lost");}});
 assert.equal(scenario.local()[0].localRevision,undefined);assert.equal(scenario.local()[0].datasetId,"dataset-a");
});

test("migrating an old local photo retains newer remote measurement fields", async () => {
  let local: any[] = [{ ...base, notes: "Old notes", photoUploadOnly: true, photoUploadId: "legacy" }];
  const remote: any = { ...base, photo: undefined, photoKey: null, notes: "New notes on other phone", localRevision: undefined };
  const writes: any[] = [];
  await syncMeasurementRecords({
    load: () => structuredClone(local), save: (items) => { local = items; }, list: async () => [remote],
    prepare: async (item: any) => ({ ...item, photo: undefined, photoLocalKey: "cached", photoKey: "media/legacy-photo" }),
    create: async (item: any) => { writes.push(item); return item; },
    update: async (item: any) => { writes.push(item); return item; },
  });
  assert.equal(writes[0].notes, remote.notes); assert.equal(local[0].photoKey, "media/legacy-photo");
  assert.equal(local[0].photoLocalKey, "cached"); assert.equal(local[0].localRevision, undefined);
});

for (const deletedAt of [null, "2026-09-21T12:00:00Z"]) {
  test(`legacy photo migration acknowledges a changed cloud dataset and deletion state (${deletedAt})`, async () => {
    let local: any[] = [{ ...base, photoUploadOnly: true, photoUploadId: "legacy" }];
    let cloud: any = { ...base, datasetId: "different-dataset", deletedAt, photo: undefined, photoKey: null, localRevision: undefined };
    let writes = 0;
    const store = {
      load: () => structuredClone(local), save: (items: any[]) => { local = items; }, list: async () => [cloud],
      prepare: async (item: any) => ({ ...item, photo: undefined, photoLocalKey: "cached", photoKey: "media/legacy" }),
      create: async () => { throw new Error("Unexpected create"); },
      update: async (item: any) => { writes++; cloud = item; return item; },
    };
    await syncMeasurementRecords(store); await syncMeasurementRecords(store);
    assert.equal(writes, 1); assert.equal(local[0].localRevision, undefined);
    assert.equal(local[0].datasetId, "different-dataset"); assert.equal(local[0].deletedAt, deletedAt);
    assert.equal(local[0].photoLocalKey, "cached"); assert.equal(cloud.photoKey, "media/legacy");
  });
}
