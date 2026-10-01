import { getCloudNoteFolder, getCloudNoteFolders, saveCloudNoteFolder } from '@workspace/api-client-react';
import { loadNoteFolders, storeNoteFolders } from './note-folders';
import { syncFolderRecords } from './note-folder-sync';
export function syncNoteFolders(accountId: string) {
  return syncFolderRecords({
    load: () => loadNoteFolders(accountId),
    save: folders => storeNoteFolders(accountId, folders),
    list: () => getCloudNoteFolders(accountId),
    get: id => getCloudNoteFolder(id, accountId),
    write: (folder, exists) => saveCloudNoteFolder(folder, exists, accountId),
  });
}
