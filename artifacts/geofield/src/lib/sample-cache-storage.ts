import { assertStorageAccount, getStorageAccountId } from './storage-account.ts';

const DB = 'geofield_sample_cache';
const STORE = 'accounts';
const KEY = 'geofield_cloud_samples';
const memory = new Map<string, any[]>();
const initializing = new Map<string, Promise<void>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function legacy(id: string): any[] {
  const scoped = `${KEY}:account:${id}`;
  const owner = localStorage.getItem('geofield_legacy_data_owner');
  const bases = [scoped, ...(!owner || owner === id ? [KEY] : [])];
  for (const base of bases) {
    let found = false;
    for (const key of [base, `${base}__backup`]) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      found = true;
      try { const value = JSON.parse(raw); if (Array.isArray(value)) return value; } catch { /* try backup */ }
    }
    if (found) throw new Error('Saved samples could not be read. Original data has been preserved; do not clear app storage.');
  }
  return [];
}

async function transact(id: string, update: (previous: any[] | undefined) => any[]) {
  const db = await openDb();
  try {
    return await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      let result: any[];
      let failure: unknown;
      request.onsuccess = () => {
        try {
          assertStorageAccount(id);
          result = update(request.result);
          store.put(result, id);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { memory.set(id, structuredClone(result)); resolve(result); };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Sample storage was interrupted. Pending changes have been retained.'));
      tx.onerror = () => { /* onabort reports uncommitted writes */ };
    });
  } finally { db.close(); }
}

/** Migrate only after a committed, independently read-back database copy exists. */
export function initializeSampleCache(forceReload = false): Promise<void> {
  const id = getStorageAccountId();
  if (!id) return Promise.resolve();
  const pending = initializing.get(id);
  if (pending) return pending;
  if (!forceReload && memory.has(id)) return Promise.resolve();
  const promise = (async () => {
    const saved = await transact(id, existing => existing ?? legacy(id));
    const db = await openDb();
    try {
      const verified = await new Promise<any[]>((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (JSON.stringify(verified) !== JSON.stringify(saved)) throw new Error('Could not verify migrated samples. Original data has been preserved.');
    } finally { db.close(); }
    assertStorageAccount(id);
    const scoped = `${KEY}:account:${id}`;
    localStorage.removeItem(scoped);
    localStorage.removeItem(`${scoped}__backup`);
    let owner = localStorage.getItem('geofield_legacy_data_owner');
    if (!owner) {
      // Claim legacy data before removing it, so another account cannot inherit it.
      localStorage.setItem('geofield_legacy_data_owner', id);
      owner = id;
    }
    if (owner === id) {
      localStorage.removeItem(KEY);
      localStorage.removeItem(`${KEY}__backup`);
    }
  })().catch(error => { memory.delete(id); throw error; }).finally(() => initializing.delete(id));
  initializing.set(id, promise);
  return promise;
}

export function readSampleCache(): any[] {
  const id = getStorageAccountId();
  if (!id) return [];
  const result = memory.get(id);
  if (!result) throw new Error('Saved samples are still loading. Please retry.');
  return structuredClone(result);
}

export async function mutateSampleCache(update: (previous: any[]) => any[]) {
  const id = getStorageAccountId();
  assertStorageAccount(id);
  await initializeSampleCache();
  assertStorageAccount(id);
  return transact(id!, previous => update(previous ?? []));
}

export async function removeAccountSampleCache(id: string) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    memory.delete(id);
  } finally { db.close(); }
}
