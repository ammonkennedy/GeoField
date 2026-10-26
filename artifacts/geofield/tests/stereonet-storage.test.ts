import test from "node:test";
import assert from "node:assert/strict";
import { newStereonet } from "../src/lib/stereonet/model.ts";
import { loadStereonets, saveStereonet } from "../src/lib/stereonet/storage.ts";
class MemoryStorage {
  data = new Map<string, string>();
  fail = false;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error("quota");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
});
Object.defineProperty(globalThis, "window", {
  value: new EventTarget(),
  configurable: true,
});
const account = (id: string) =>
  storage.setItem("geofield-account:test", JSON.stringify({ user: { id } }));
test("offline save, reopen, account isolation and stale revisions", () => {
  account("A");
  const saved = saveStereonet(newStereonet("Offline A"), "A");
  assert.deepEqual(loadStereonets(), [saved]);
  account("B");
  assert.equal(loadStereonets().length, 0);
  assert.throws(() => saveStereonet(saved, "A"), /account changed/);
  saveStereonet(newStereonet("Offline B"), "B");
  account("A");
  assert.equal(loadStereonets()[0].name, "Offline A");
  const changed = saveStereonet({ ...saved, name: "Changed" }, "A");
  assert.throws(
    () => saveStereonet({ ...saved, name: "Stale" }, "A"),
    /another window/,
  );
  assert.equal(loadStereonets()[0].name, changed.name);
  storage.fail = true;
  assert.throws(
    () => saveStereonet({ ...changed, name: "Failed save" }, "A"),
    /quota/,
  );
  storage.fail = false;
  assert.equal(loadStereonets()[0].name, "Changed");
});

test('saved old imports repair durably and queue a new revision without changing source data', async () => {
  const {writeDurableArray}=await import('../src/lib/durable-storage.ts');
  const {importMeasurement}=await import('../src/lib/stereonet/model.ts');
  account('Repair');
  const net=newStereonet('Old import');
  const source={id:'plane',strikeDegrees:190,dipDegrees:60,dipDirectionDegrees:90,label:'Fault',notes:'',featureType:'fault',northReference:'magnetic'} as any;
  net.measurements=[{...importMeasurement(source,net.groups[0].id),azimuth:0}];
  net.cloudRevision='cloud-old';
  writeDurableArray('geofield_stereonets',[net]);
  const repaired=loadStereonets()[0];
  assert.equal(repaired.measurements[0].azimuth,190);
  assert.equal(repaired.cloudRevision,'cloud-old');assert.ok(repaired.localRevision);
  assert.equal(loadStereonets()[0].localRevision,repaired.localRevision);
  assert.equal(repaired.measurements[0].raw.dipDirectionDegrees,90);
});

test("invalid saves leave existing stereonets intact", () => {
  account("InvalidSave");
  const saved = saveStereonet(newStereonet("Keep this net"), "InvalidSave");
  assert.throws(
    () => saveStereonet({ ...saved, groups: [] }, "InvalidSave"),
    /could not be verified/,
  );
  assert.deepEqual(loadStereonets(), [saved]);
});

test("malformed local records report an error without rewriting stored data", async () => {
  const { writeDurableArray } = await import("../src/lib/durable-storage.ts");
  account("InvalidLocal");
  writeDurableArray("geofield_stereonets", [
    { ...newStereonet("Recoverable original"), measurements: [null] },
  ]);
  const before = new Map(storage.data);
  assert.throws(() => loadStereonets(), /could not be verified/);
  assert.deepEqual(storage.data, before);
});

test("draft edits do not change the saved project snapshot until saved again", () => {
  account("ExplicitSave");
  const draft = { ...newStereonet("Preview"), savedDatasetId: "project-one" };
  assert.equal(loadStereonets().length, 0);
  const saved = saveStereonet(draft, "ExplicitSave");
  const edited = { ...saved, name: "Edited preview", savedDatasetId: "project-two", grid: false };
  assert.deepEqual(loadStereonets(), [saved]);
  const updated = saveStereonet(edited, "ExplicitSave");
  assert.deepEqual(loadStereonets(), [updated]);
  assert.equal(updated.savedDatasetId, "project-two");
});
