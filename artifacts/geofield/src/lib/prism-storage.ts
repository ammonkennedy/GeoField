import { PRISM_VARIABLES, type PrismData } from './prism';
export interface PrismRegion { id: string; name: string; savedAt: string; data: PrismData }
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('geofield_prism_regions', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('regions', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other GeoField tabs and try again.'));
  });
}
export async function prismRegions(action: 'list' | 'put' | 'delete', value?: PrismRegion | string): Promise<PrismRegion[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('regions', action === 'list' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('regions');
      const request = action === 'put' ? store.put(value) : action === 'delete' ? store.delete(value as string) : store.getAll();
      tx.oncomplete = () => resolve(action === 'list' ? request.result as PrismRegion[] : []);
      tx.onerror = () => reject(tx.error ?? new Error('Climate region could not be saved.'));
      tx.onabort = () => reject(tx.error ?? new Error('Climate region could not be saved.'));
    });
  } finally { db.close(); }
}
let loading: Promise<PrismData> | undefined;
export function loadPrism(): Promise<PrismData> {
  if (loading) return loading;
  loading = (async () => {
    const base = `${import.meta.env.BASE_URL}prism/`;
    const response = await fetch(`${base}manifest.json`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Could not load PRISM climate data. Connect to the internet or open a downloaded region.');
    const manifest = await response.json();
    const { grid, accessed } = manifest;
    if (manifest.version !== 1 || grid.width !== 1405 || grid.height !== 621) throw new Error('Unsupported PRISM grid.');
    const values = {} as PrismData['values'];
    await Promise.all(PRISM_VARIABLES.map(async variable => {
      const result = await fetch(`${base}${manifest.variables[variable].file}`, { signal: AbortSignal.timeout(60000) });
      if (!result.ok) throw new Error('Climate download failed. Please retry with a connection.');
      const bytes = await result.arrayBuffer();
      // Some hosts decompress .gz responses via Content-Encoding; accept either form.
      const compressed = new Uint8Array(bytes)[0] === 31 && new Uint8Array(bytes)[1] === 139;
      const buffer = compressed ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : bytes;
      if (buffer.byteLength !== grid.width * grid.height * 4) throw new Error('Incomplete PRISM grid. Please retry.');
      const view = new DataView(buffer);
      const cells = new Float32Array(grid.width * grid.height);
      for (let i = 0; i < cells.length; i++) cells[i] = view.getFloat32(i * 4, true);
      values[variable] = cells;
    }));
    return { grid, accessed, values };
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
