import { createNoteFolder, loadNoteFolders, updateFolderNotes } from "../src/lib/note-folders.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFieldNote, editFieldNote, loadFieldNotes } from "../src/lib/field-notes.ts";

function storageTest(run: () => void) {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });
  try { run(); }
  finally {
    if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage); else delete (globalThis as any).localStorage;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else delete (globalThis as any).window;
  }
}
test("notes are isolated by signed-in account and cannot be saved as a guest", () => storageTest(() => {
  const note = createFieldNote("account-a");
  editFieldNote("account-a", note.id, (item) => ({ ...item, body: "Private observations" }));
  assert.equal(loadFieldNotes("account-a")[0].body, "Private observations");
  assert.deepEqual(loadFieldNotes("account-b"), []);
  assert.throws(() => createFieldNote(""), /Sign in/);
}));
test("text edits preserve attachments added separately and survive a fresh read", () => storageTest(() => {
  const note = createFieldNote("account-a");
  editFieldNote("account-a", note.id, (item) => ({ ...item, photos: [{ id: "photo", fileName: "outcrop.jpg", localKey: "photo-key" }] }));
  const saved = editFieldNote("account-a", note.id, (item) => ({ ...item, title: "Outcrop", body: "New field notes" }));
  assert.notEqual(saved.localRevision, note.localRevision);
  assert.equal(loadFieldNotes("account-a")[0].photos[0].localKey, "photo-key");
  assert.equal(loadFieldNotes("account-a")[0].body, "New field notes");
}));
test("deleting a note retains text and photo links for restoration", () => storageTest(() => {
  const note = createFieldNote("account-a");
  editFieldNote("account-a", note.id, (item) => ({ ...item, body: "Keep", deletedAt: new Date().toISOString() }));
  const restored = editFieldNote("account-a", note.id, (item) => ({ ...item, deletedAt: null }));
  assert.equal(restored.body, "Keep");
  assert.equal(restored.deletedAt, null);
}));

test("folders group existing notes without changing text, photos, or creation order", () => storageTest(() => {
  const first = createFieldNote("account-a");
  const second = createFieldNote("account-a");
  editFieldNote("account-a", first.id, item => ({ ...item, title: "Note 100", photos: [{ id: "photo", fileName: "photo.jpg", localKey: "saved-photo" }] }));
  const before = loadFieldNotes("account-a");
  const folder = createNoteFolder("account-a", "  Ridge  ");
  updateFolderNotes("account-a", folder.id, [first.id, second.id, first.id]);
  assert.deepEqual(loadNoteFolders("account-a")[0].noteIds, [first.id, second.id]);
  assert.equal(loadNoteFolders("account-a")[0].name, "Ridge");
  assert.deepEqual(loadFieldNotes("account-a"), before);
  updateFolderNotes("account-a", folder.id, [first.id], true);
  assert.deepEqual(loadNoteFolders("account-a")[0].noteIds, [second.id]);
  assert.deepEqual(loadFieldNotes("account-a"), before);
  assert.deepEqual(loadNoteFolders("account-b"), []);
}));
test("empty folders survive reload, invalid membership cannot discard valid members", () => storageTest(() => {
  assert.throws(() => createNoteFolder("account-a", " "), /name/);
  assert.throws(() => createNoteFolder("", "Ridge"), /Sign in/);
  const folder = createNoteFolder("account-a", "Empty folder");
  assert.deepEqual(loadNoteFolders("account-a")[0].noteIds, []);
  const note = createFieldNote("account-a");
  updateFolderNotes("account-a", folder.id, [note.id]);
  assert.throws(() => updateFolderNotes("account-a", folder.id, ["missing"]), /no longer available/);
  assert.deepEqual(loadNoteFolders("account-a")[0].noteIds, [note.id]);
  assert.throws(() => updateFolderNotes("account-b", folder.id, [note.id]), /no longer available/);
}));
