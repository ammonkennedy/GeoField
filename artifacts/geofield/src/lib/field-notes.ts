import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

export interface NotePhoto {
  id: string;
  fileName: string;
  localKey?: string;
  cloudKey?: string;
}
export interface FieldNote {
  id: string;
  title: string;
  body: string;
  photos: NotePhoto[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  cloudUpdatedAt?: string;
  localRevision?: string;
}
export const FIELD_NOTES_UPDATED = "field-notes-updated";
const key = (accountId: string) => `geofield_field_notes:${accountId}`;
export function loadFieldNotes(accountId: string): FieldNote[] {
  return accountId ? readDurableArray<FieldNote>(key(accountId)) : [];
}
export function storeFieldNotes(accountId: string, notes: FieldNote[]) {
  if (!accountId) throw new Error("Sign in to save field notes.");
  writeDurableArray(key(accountId), notes);
  window.dispatchEvent(new Event(FIELD_NOTES_UPDATED));
}
export function createFieldNote(accountId: string) {
  const now = new Date().toISOString();
  const note: FieldNote = { id: crypto.randomUUID(), title: "", body: "", photos: [], createdAt: now, updatedAt: now, localRevision: crypto.randomUUID() };
  storeFieldNotes(accountId, [note, ...loadFieldNotes(accountId)]);
  return note;
}
export function editFieldNote(accountId: string, id: string, update: (note: FieldNote) => FieldNote) {
  let saved: FieldNote | undefined;
  const notes = loadFieldNotes(accountId).map((note) => {
    if (note.id !== id) return note;
    saved = { ...update(note), id, cloudUpdatedAt: note.cloudUpdatedAt ?? (!note.localRevision ? note.updatedAt : undefined), updatedAt: new Date().toISOString(), localRevision: crypto.randomUUID() };
    return saved;
  });
  if (!saved) throw new Error("This field note is no longer available.");
  storeFieldNotes(accountId, notes);
  return saved;
}

export function prepareNotePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Choose a photo file."));
  if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error("Please choose a photo smaller than 25 MB."));
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this photo.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo could not be opened. Try a JPEG or PNG image.")); };
    image.src = url;
  });
}
