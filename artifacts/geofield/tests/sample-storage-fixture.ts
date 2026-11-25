import { IDBFactory } from 'fake-indexeddb';
import { initializeSampleCache } from '../src/lib/sample-cache-storage.ts';
export async function sampleStorageFixture(resetDatabase = true) {
  const values = new Map<string, string>();
  if (resetDatabase) Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  }});
  values.set('geofield-account:pool', JSON.stringify({ user: { id: 'fixture-owner' } }));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent() {} } });
  await initializeSampleCache(true);
  return values;
}
