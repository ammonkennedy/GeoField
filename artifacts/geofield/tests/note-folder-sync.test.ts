import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncFolderRecords } from '../src/lib/note-folder-sync.ts';
import type { NoteFolder } from '../src/lib/note-folders.ts';
const folder: NoteFolder = { id: 'folder', name: 'Ridge', noteIds: ['note-1'], createdAt: '2026-09-30T10:00:00Z', updatedAt: '2026-09-30T10:00:00Z', localRevision: 'edit-1' };
function setup(initial = [folder]) {
  let local = structuredClone(initial);
  let cloud: NoteFolder[] = [];
  const store = {
    load: () => structuredClone(local),
    save: (items: NoteFolder[]) => { local = structuredClone(items); },
    list: async () => structuredClone(cloud),
    get: async (id: string) => structuredClone(cloud.find(item => item.id === id) ?? null),
    write: async (item: NoteFolder, _exists: boolean) => {
      const saved = { ...item, updatedAt: '2026-09-30T11:00:00Z', localRevision: undefined };
      cloud = [...cloud.filter(f => f.id !== item.id), saved]; return structuredClone(saved);
    },
  };
  return { store, local: () => local, cloud: () => cloud, setCloud: (items: NoteFolder[]) => { cloud = structuredClone(items); } };
}
test('folder creation and membership download to a second device, including empty folders', async () => {
 const a = setup([folder, { ...folder, id:'empty', name:'Empty', noteIds:[] }]);
 await syncFolderRecords(a.store);
 assert.equal(a.local()[0].localRevision, undefined);
 const b = setup([]); b.setCloud(a.cloud()); await syncFolderRecords(b.store);
 assert.deepEqual(b.local().map(f => [f.id, f.noteIds]), [['folder', ['note-1']], ['empty', []]]);
});
test('unconfirmed membership stays pending rather than disappearing after sync', async () => {
 const a = setup();
 a.store.write = async item => ({ ...item, noteIds: [], localRevision: undefined });
 await assert.rejects(syncFolderRecords(a.store), /confirm/);
 assert.deepEqual(a.local()[0].noteIds, ['note-1']);
 assert.equal(a.local()[0].localRevision, 'edit-1');
});
test('adding another note during an upload is retained and sent on the next sync', async () => {
 const a = setup(); const write = a.store.write;
 a.store.write = async (item, exists) => {
   const saved = await write(item, exists);
   a.store.save([{ ...folder, noteIds: ['note-1', 'note-2'], localRevision: 'edit-2' }]);
   return saved;
 };
 await syncFolderRecords(a.store);
 assert.deepEqual(a.local()[0].noteIds, ['note-1', 'note-2']);
 assert.equal(a.local()[0].localRevision, 'edit-2');
 a.store.write = write; await syncFolderRecords(a.store);
 assert.deepEqual(a.cloud()[0].noteIds, ['note-1', 'note-2']);
 assert.equal(a.local()[0].localRevision, undefined);
});
test('conflicting memberships preserve the other device version as a recovery folder', async () => {
 const a = setup([{ ...folder, cloudUpdatedAt: '2026-09-30T09:00:00Z' }]);
 a.setCloud([{ ...folder, noteIds:['other-note'], updatedAt:'2026-09-30T10:30:00Z', localRevision:undefined }]);
 await syncFolderRecords(a.store);
 assert.ok(a.local().some(item => item.id !== folder.id && item.noteIds.includes('other-note')));
 assert.deepEqual(a.local().find(item => item.id === folder.id)?.noteIds, ['note-1']);
});
