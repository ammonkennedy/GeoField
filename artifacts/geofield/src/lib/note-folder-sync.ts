import type { FieldNote } from './field-notes.ts';
import type { NoteFolder } from './note-folders.ts';
import { syncNoteRecords } from './field-note-sync.ts';

// Reuse the tested acknowledgement/conflict-recovery engine with a folder adapter.
// No folder is stored as a note, and no note is rewritten when membership changes.
export function folderAsSyncRecord(folder: NoteFolder): FieldNote {
  const { name, noteIds, ...rest } = folder;
  return { ...rest, title: name, body: JSON.stringify([...new Set(noteIds)].sort()), photos: [] };
}
export function syncRecordAsFolder(record: FieldNote): NoteFolder {
  const { title, body, photos: _photos, ...rest } = record;
  const ids: unknown = JSON.parse(body);
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('Invalid folder membership. Local folders have been preserved.');
  return { ...rest, name: title, noteIds: ids };
}
interface FolderSyncStore {
  load: () => NoteFolder[];
  save: (folders: NoteFolder[]) => void;
  list: () => Promise<NoteFolder[]>;
  get: (id: string) => Promise<NoteFolder | null>;
  write: (folder: NoteFolder, exists: boolean) => Promise<NoteFolder>;
}
export function syncFolderRecords(store: FolderSyncStore) {
  return syncNoteRecords({
    load: () => store.load().map(folderAsSyncRecord),
    save: records => store.save(records.map(syncRecordAsFolder)),
    list: async () => (await store.list()).map(folderAsSyncRecord),
    get: async id => { const folder = await store.get(id); return folder ? folderAsSyncRecord(folder) : null; },
    write: async (record, exists) => folderAsSyncRecord(await store.write(syncRecordAsFolder(record), exists)),
    uploadPhoto: async () => { throw new Error('Folders cannot contain photo attachments directly.'); },
    cachePhoto: async photo => photo,
  });
}
