import { getLocalDatasets } from './local-datasets';
import { resolveDatasetId } from './dataset-identity';
import { getTrackCloudObject, listTrackCloudObjects, putTrackCloudObject } from '@workspace/api-client-react';
import { assertStorageAccount } from './storage-account';
import { syncTrackRecords, validateTrackSnapshot } from './track-sync';
import { loadTracks, storeTracks, updateTrack, trackingStatus } from './tracks';
export async function syncTracks(accountId: string) {
  const check = () => assertStorageAccount(accountId);
  check();
  const datasets = getLocalDatasets();
  for (const track of loadTracks()) {
    const resolved = resolveDatasetId(track.datasetId, datasets);
    if (resolved !== track.datasetId) updateTrack(track.id, { datasetId: resolved });
  }
  await syncTrackRecords({
    load: () => { check(); return loadTracks(true); },
    save: tracks => { check(); storeTracks(tracks); },
    activeId: () => trackingStatus().activeId,
    put: snapshot => {
      if (!snapshot.track.deletedAt && Number(snapshot.track.datasetId) < 0) throw new Error(`Track "${snapshot.track.name}" is waiting for its dataset to sync.`);
      return putTrackCloudObject(snapshot, snapshot, accountId);
    },
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
