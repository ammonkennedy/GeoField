import type { StoredTrack } from './track-sync';
import { assertStorageAccount, getStorageAccountId } from './storage-account';
import { readDurableArray } from './durable-storage';

const DB = 'geofield_track_store';
const STORE = 'accounts';
const cache = new Map<string, StoredTrack[]>();
const initializing = new Map<string, Promise<void>>();
function legacyTracks(id: string): StoredTrack[] {
  const key = `geofield_tracks:account:${id}`;
  if (localStorage.getItem(key) !== null || localStorage.getItem(`${key}__backup`) !== null) {
    return readDurableArray<StoredTrack>(key);
  }
  const legacyOwner = localStorage.getItem('geofield_legacy_data_owner');
  if (legacyOwner && legacyOwner !== id) return [];
  // Do not copy a large legacy collection into localStorage during migration:
  // that copy itself can fail at the quota we are migrating away from.
  let found = false;
  for (const key of ['geofield_tracks', 'geofield_tracks__backup']) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    found = true;
    try { const value = JSON.parse(raw); if (Array.isArray(value)) return value; } catch { /* try backup */ }
  }
  if (found) throw new Error('Saved tracks could not be read. Original data has been preserved.');
  return [];
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function owner() {
  const id = getStorageAccountId();
  if (!id) throw new Error('Sign in to save tracks.');
  return id;
}
export function readTrackCache(): StoredTrack[] {
  const id = getStorageAccountId();
  if (!id) return [];
  const tracks = cache.get(id);
  if (!tracks) throw new Error('Tracks are still loading. Please retry.');
  return tracks;
}
// Read/modify/write in one transaction prevents concurrent tabs from losing points.
async function transact(id: string, update: (tracks: StoredTrack[] | undefined) => StoredTrack[]) {
  const db = await openDb();
  try {
    return await new Promise<StoredTrack[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      let result: StoredTrack[];
      let failure: unknown;
      request.onsuccess = () => {
        try {
          assertStorageAccount(id);
          const previous: StoredTrack[] | undefined = request.result;
          result = update(previous);
          if (!previous || result.length !== previous.length || result.some((track, index) => track !== previous[index])) {
            store.put(result, id);
          }
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { cache.set(id, result); resolve(result); };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Track storage transaction failed.'));
      tx.onerror = () => { /* onabort reports failure; never acknowledge an uncommitted write */ };
    });
  } finally { db.close(); }
}
export function initializeTrackStorage(): Promise<void> {
  const id = getStorageAccountId();
  if (!id) return Promise.resolve();
  const pending = initializing.get(id);
  if (pending) return pending;
  if (cache.has(id)) return Promise.resolve();
  const promise = (async () => {
    // Only read legacy data when no committed database record exists.
    await transact(id, existing => existing ?? legacyTracks(id).map(track =>
      !track.localRevision && !track.cloudRevision ? { ...track, localRevision: crypto.randomUUID() } : track));
    assertStorageAccount(id);
    const db = await openDb();
    try {
      const verified = await new Promise<StoredTrack[]>((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (JSON.stringify(verified) !== JSON.stringify(cache.get(id))) throw new Error('Could not verify migrated tracks. Original tracks were preserved.');
    } finally { db.close(); }
    // The committed database is authoritative. Removal failures are harmless.
    assertStorageAccount(id);
    const key = `geofield_tracks:account:${id}`;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}__backup`);
      const legacyOwner = localStorage.getItem('geofield_legacy_data_owner');
      if (!legacyOwner || legacyOwner === id) {
        localStorage.removeItem('geofield_tracks');
        localStorage.removeItem('geofield_tracks__backup');
        if (!legacyOwner) localStorage.setItem('geofield_legacy_data_owner', id);
      }
    } catch { /* retain old copies if storage is inaccessible */ }
  })().catch(error => { cache.delete(id); throw error; }).finally(() => initializing.delete(id));
  initializing.set(id, promise);
  return promise;
}
export async function mutateTrackStorage(update: (tracks: StoredTrack[]) => StoredTrack[]) {
  const id = owner();
  await initializeTrackStorage();
  assertStorageAccount(id);
  await transact(id, tracks => update(tracks ?? []));
}
export async function removeAccountTracks(id: string) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    cache.delete(id);
  } finally { db.close(); }
}
