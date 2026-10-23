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
