import { readDurableArray, writeDurableArray } from './durable-storage.ts';
import { loadFieldNotes } from './field-notes.ts';

export interface NoteFolder {
  id: string;
  name: string;
  noteIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  cloudUpdatedAt?: string;
  localRevision?: string;
}
export const NOTE_FOLDERS_UPDATED = 'note-folders-updated';
const key = (accountId: string) => `geofield_note_folders:${accountId}`;
export function loadNoteFolders(accountId: string): NoteFolder[] {
  return accountId ? readDurableArray<NoteFolder>(key(accountId)) : [];
}
export function storeNoteFolders(accountId: string, folders: NoteFolder[]) {
  if (!accountId) throw new Error('Sign in to save note folders.');
  writeDurableArray(key(accountId), folders);
  window.dispatchEvent(new Event(NOTE_FOLDERS_UPDATED));
}
export function createNoteFolder(accountId: string, name: string): NoteFolder {
  name = name.trim();
  if (!name || name.length > 120) throw new Error('Enter a folder name between 1 and 120 characters.');
  const now = new Date().toISOString();
  const folder: NoteFolder = { id: crypto.randomUUID(), name, noteIds: [], createdAt: now, updatedAt: now, localRevision: crypto.randomUUID() };
  storeNoteFolders(accountId, [folder, ...loadNoteFolders(accountId)]);
  return folder;
}
/** Change references only; note contents, photos and creation dates are untouched. */
export function updateFolderNotes(accountId: string, folderId: string, ids: string[], remove = false) {
  const folders = loadNoteFolders(accountId);
  const folder = folders.find(item => item.id === folderId && !item.deletedAt);
  if (!folder) throw new Error('This folder is no longer available. Your notes are still in All Notes.');
  if (!remove) {
    const available = new Set(loadFieldNotes(accountId).filter(note => !note.deletedAt).map(note => note.id));
    if (ids.some(id => !available.has(id))) throw new Error('A selected note is no longer available. Refresh the selection and try again.');
  }
  const next = { ...folder,
    noteIds: remove ? folder.noteIds.filter(id => !ids.includes(id)) : [...new Set([...folder.noteIds, ...ids])],
    cloudUpdatedAt: folder.cloudUpdatedAt ?? (!folder.localRevision ? folder.updatedAt : undefined),
    updatedAt: new Date(Math.max(Date.now(), (Date.parse(folder.updatedAt) || 0) + 1)).toISOString(),
    localRevision: crypto.randomUUID(),
  };
  storeNoteFolders(accountId, folders.map(item => item.id === folderId ? next : item));
  return next;
}
