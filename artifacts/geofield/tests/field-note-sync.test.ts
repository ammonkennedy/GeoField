import assert from "node:assert/strict";
import { test } from "node:test";
import { syncNoteRecords } from "../src/lib/field-note-sync.ts";
import type { FieldNote, NotePhoto } from "../src/lib/field-notes.ts";

const note: FieldNote = { id: "note-1", title: "Ridge", body: "Bedding changes here", photos: [{ id: "photo-1", localKey: "local-photo", fileName: "outcrop.jpg" }], createdAt: "2026-09-18T10:00:00Z", updatedAt: "2026-09-18T10:00:00Z", localRevision: "revision-1" };
function setup() {
  let local: FieldNote[] = [structuredClone(note)];
  let remote: FieldNote[] = [];
  let uploads = 0;
  const store = {
    load: () => structuredClone(local),
    save: (notes: FieldNote[]) => { local = structuredClone(notes); },
    list: async () => structuredClone(remote),
    uploadPhoto: async (_id: string, photo: NotePhoto) => { uploads++; return { ...photo, cloudKey: "cloud-photo" }; },
    write: async (saved: FieldNote, _exists: boolean) => {
      const cloud = { ...saved, photos: saved.photos.map(({localKey, ...photo}) => photo), localRevision: undefined, deletedAt: saved.deletedAt ?? null };
      remote = [cloud]; return structuredClone(cloud);
    },
    cachePhoto: async (photo: NotePhoto) => ({ ...photo, localKey: "downloaded-photo" }),
  };
  return { store, local: () => local, remote: () => remote, uploads: () => uploads };
}
test("note and photos upload together while the offline photo reference survives", async () => {
  const scenario = setup();
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.remote()[0].body, note.body);
  assert.equal(scenario.remote()[0].photos[0].cloudKey, "cloud-photo");
  assert.equal(scenario.local()[0].photos[0].localKey, "local-photo");
  assert.equal(scenario.local()[0].localRevision, undefined);
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.uploads(), 1);
});
test("failed photo upload retains pending text and photo; no partial note is published", async () => {
  const scenario = setup();
  scenario.store.uploadPhoto = async () => { throw new Error("Network error"); };
  await assert.rejects(syncNoteRecords(scenario.store), /Network/);
  assert.deepEqual(scenario.local(), [note]);
  assert.deepEqual(scenario.remote(), []);
});
test("typing or removing a photo while uploading is preserved for the next sync", async () => {
  const scenario = setup();
  const upload = scenario.store.uploadPhoto;
  scenario.store.uploadPhoto = async (id, photo) => {
    scenario.store.save([{ ...note, body: "New text", photos: [], localRevision: "revision-2" }]);
    return upload(id, photo);
  };
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.local()[0].body, "New text");
  assert.deepEqual(scenario.local()[0].photos, []);
  assert.equal(scenario.local()[0].localRevision, "revision-2");
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.remote()[0].body, "New text");
  assert.deepEqual(scenario.remote()[0].photos, []);
});
test("notes downloaded on another device cache their photos for offline use", async () => {
  const scenario = setup();
  await syncNoteRecords(scenario.store);
  scenario.store.save([]);
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.local()[0].photos[0].localKey, "downloaded-photo");
  assert.equal(scenario.local()[0].body, note.body);
});
test("deleting and restoring notes syncs without deleting their photo links", async () => {
  const scenario = setup();
  const deletedAt = "2026-09-18T12:00:00Z";
  scenario.store.save([{ ...note, deletedAt }]);
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.remote()[0].deletedAt, deletedAt);
  scenario.store.save([{ ...scenario.local()[0], deletedAt: null, localRevision: "restore" }]);
  await syncNoteRecords(scenario.store);
  assert.equal(scenario.remote()[0].deletedAt, null);
  assert.equal(scenario.local()[0].photos[0].localKey, "local-photo");
});
test("cloud responses missing a photo cannot clear the pending revision", async () => {
  const scenario = setup();
  scenario.store.write = async (item) => ({ ...item, photos: [] });
  await assert.rejects(syncNoteRecords(scenario.store), /complete field note/);
  assert.deepEqual(scenario.local(), [note]);
});
