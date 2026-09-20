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
    cachePhoto: async (photo: NotePhoto) => ({ ...photo, localKey: photo.localKey || "downloaded-photo" }),
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
test("notes keep the other device's version as a recovery copy during a detected conflict", async () => {
 const scenario=setup();
 const remote={...note,body:"Other device",photos:[],localRevision:undefined,updatedAt:"2026-09-19T12:00:00Z"};
 scenario.store.list=async()=>[remote];
 scenario.store.save([{...note,photos:[],cloudUpdatedAt:"2026-09-18T12:00:00Z"}]);
 const written:FieldNote[]=[];
 scenario.store.write=async(value)=>{written.push(value);return value;};
 await syncNoteRecords(scenario.store);
 assert.equal(written.length,2);assert.match(written[0].id,/recovered/);assert.equal(written[0].body,"Other device");assert.equal(written[1].body,note.body);
 assert.ok(scenario.local().some((item)=>item.body==="Other device"));
});
test("a later note failure preserves the earlier note's acknowledgment and cloud photo key", async () => {
 const scenario=setup();scenario.store.save([note,{...note,id:"second",localRevision:"second-edit"}]);
 const write=scenario.store.write;scenario.store.write=async(value,exists)=>{if(value.id==="second")throw new Error("second note failed");return write(value,exists);};
 await assert.rejects(syncNoteRecords(scenario.store),/second note failed/);
 assert.equal(scenario.local()[0].localRevision,undefined);assert.equal(scenario.local()[0].photos[0].cloudKey,"cloud-photo");assert.equal(scenario.local()[1].localRevision,"second-edit");
});
test("one unavailable photo cannot block an unrelated note from syncing", async () => {
 const scenario=setup();scenario.store.save([note,{...note,id:"healthy",photos:[],localRevision:"healthy-edit"}]);
 scenario.store.uploadPhoto=async()=>{throw new Error("photo unavailable");};
 await assert.rejects(syncNoteRecords(scenario.store),/photo unavailable/);
 assert.equal(scenario.local().find((item)=>item.id===note.id)?.localRevision,note.localRevision);assert.equal(scenario.local().find((item)=>item.id==="healthy")?.localRevision,undefined);
});
test("a lost note response reuses the confirmed photo key without uploading again or making a false conflict copy", async () => {
 const scenario=setup();const cloud={...note,photos:[{id:"photo-1",fileName:"outcrop.jpg",cloudKey:"cloud-photo"}],localRevision:undefined,updatedAt:"2026-09-20T12:00:00Z"};
 scenario.store.save([{...note,cloudUpdatedAt:"2026-09-18T10:00:00Z"}]);scenario.store.write=async()=>{throw new Error("must not rewrite");};
 await syncNoteRecords({...scenario.store,get:async()=>cloud});
 assert.equal(scenario.uploads(),0);assert.equal(scenario.local()[0].localRevision,undefined);assert.equal(scenario.local().length,1);assert.equal(scenario.local()[0].photos[0].cloudKey,"cloud-photo");
});
