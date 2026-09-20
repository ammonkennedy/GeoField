import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareMeasurementPhoto, cacheMeasurementPhoto } from "../src/lib/measurement-photo-sync.ts";
import { mergeMeasurements } from "../src/lib/merge-measurements.ts";
const item = { id: "measurement", photo: "data:image/jpeg;base64,cGhvdG8=", photoUploadId: "version-one" } as any;
function setup() {
  const files = new Map<string, string>(); const uploads: string[] = [];
  return { files, uploads, store: {
    read: async (key: string) => files.get(key) ?? null,
    store: async (data: string) => { const key = `local-${files.size}`; files.set(key, data); return key; },
    upload: async (id: string, version: string, data: string) => { const key = `media/owner/${id}/${version}`; files.set(key, data); uploads.push(key); return key; },
    download: async (key: string) => { const data = files.get(key); if (!data) throw new Error("Network unavailable"); return data; },
  } };
}
test("legacy inline measurement photos upload and cache offline on another device", async () => {
  const a = setup(); const saved = await prepareMeasurementPhoto(item, a.store);
  assert.ok(saved.photoKey); assert.equal(saved.photo, undefined); assert.ok(saved.photoLocalKey);
  const b = setup(); b.files.set(saved.photoKey!, item.photo);
  const received = await cacheMeasurementPhoto({ id: item.id, photoKey: saved.photoKey } as any, b.store);
  assert.equal(await b.store.read(received.photoLocalKey!), item.photo);
});
test("photo retries use the same key; replacements use a new immutable key", async () => {
  const s = setup(); const a = await prepareMeasurementPhoto(item, s.store); const retry = await prepareMeasurementPhoto(item, s.store);
  assert.equal(a.photoKey, retry.photoKey);
  const changed = await prepareMeasurementPhoto({ ...item, photoUploadId: "version-two" }, s.store); assert.notEqual(changed.photoKey, a.photoKey);
});
test("missing local attachment prevents measurement acknowledgment", async () => {
  await assert.rejects(prepareMeasurementPhoto({ ...item, photo: undefined, photoLocalKey: "missing" }, setup().store), /unavailable/);
});
test("already downloaded photos work without network access", async () => {
  const s = setup(); s.files.set("local", item.photo);
  const saved = { ...item, photo: undefined, photoKey: "media/cloud", photoLocalKey: "local" };
  assert.equal(await cacheMeasurementPhoto(saved, s.store), saved);
});
test("remote photo replacement and removal clear stale cached photo pointers", () => {
  const local = { id: "measurement", photoKey: "media/old", photoLocalKey: "local", photo: "old", updatedAt: "2026-09-20T10:00:00Z" };
  for (const photoKey of ["media/new", null]) {
    const remote = { id: local.id, photoKey, updatedAt: "2026-09-20T12:00:00Z" };
    const merged = mergeMeasurements([local], [remote], [local]);
    assert.equal(merged[0].photo, undefined); assert.equal(merged[0].photoLocalKey, undefined); assert.equal(merged[0].photoKey, photoKey);
  }
});
