import { getTrackCloudObject, listTrackCloudObjects, putTrackCloudObject } from '@workspace/api-client-react';
import { assertStorageAccount } from './storage-account';
import { syncTrackRecords, validateTrackSnapshot } from './track-sync';
import { loadTracks, storeTracks, trackingStatus } from './tracks';
export async function syncTracks(accountId: string) {
  const check = () => assertStorageAccount(accountId);
  await syncTrackRecords({
    load: () => { check(); return loadTracks(true); },
    save: tracks => { check(); storeTracks(tracks); },
    activeId: () => trackingStatus().activeId,
    put: snapshot => putTrackCloudObject(snapshot, snapshot, accountId),
    get: async snapshot => validateTrackSnapshot(await getTrackCloudObject(snapshot, accountId)),
    list: async () => {
      const objects = await listTrackCloudObjects(accountId);
      const snapshots = [];
      for (const object of objects) {
        check();
        const snapshot = validateTrackSnapshot(await getTrackCloudObject(object, accountId));
        if (snapshot.revision !== object.revision || snapshot.parent !== object.parent) throw new Error('Cloud track revision does not match its saved data.');
        snapshots.push(snapshot);
      }
      return snapshots;
    },
  });
}
