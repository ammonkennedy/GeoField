// Public map tiles only: separate from account records and pending field data.
export const GEOLOGY_PROTOCOL = 'geofield-geology';
export const GEOLOGY_CACHE_EVENT = 'geofield-geology-cache-status';
const MAX_BYTES = 128 * 1024 * 1024;
let warning = '';
export function geologyCacheWarning() { return warning; }
function report(message: string) {
  warning = message;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GEOLOGY_CACHE_EVENT));
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('geofield_geology_tiles_v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tiles');
      request.result.createObjectStore('meta');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Map storage is busy.'));
  });
}
export const geologyTileStore = {
  async get(url: string): Promise<ArrayBuffer | undefined> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('tiles', 'readonly');
        const request = tx.objectStore('tiles').get(url);
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  },
  async put(url: string, bytes: ArrayBuffer): Promise<void> {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['tiles', 'meta'], 'readwrite');
        const tiles = tx.objectStore('tiles');
        const meta = tx.objectStore('meta');
        const existing = tiles.get(url);
        existing.onsuccess = () => {
          if (existing.result) return;
          const size = meta.get('bytes');
          size.onsuccess = () => {
            const total = (size.result ?? 0) + bytes.byteLength;
            // Never evict a field area silently or consume unlimited field-data storage.
            if (total > MAX_BYTES) {
              reject(new Error('Geology offline storage is full. Existing areas remain available.'));
              tx.abort();
              return;
            }
            tiles.put(bytes, url);
            meta.put(total, 'bytes');
          };
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  },
};

/** Cache-first works even when the phone reports online but has no usable service. */
export async function loadGeologyTile(
  protocolUrl: string,
  signal: AbortSignal,
  store = geologyTileStore,
  fetchTile: typeof fetch = fetch,
  requireSaved = false,
): Promise<{ data: ArrayBuffer }> {
  const url = protocolUrl.replace(`${GEOLOGY_PROTOCOL}://`, 'https://');
  if (!/^https:\/\/tiles\.macrostrat\.org\/carto\/\d+\/\d+\/\d+\.mvt$/.test(url)) {
    throw new Error('Invalid geology tile URL');
  }
  signal.throwIfAborted();
  let cached: ArrayBuffer | undefined;
  try { cached = await store.get(url); }
  catch (error) {
    if (requireSaved) throw error;
    report('Offline geology storage is unavailable. Map areas cannot be saved on this device.');
  }
  signal.throwIfAborted();
  if (cached) return { data: cached };
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Geology download timed out. Please retry.', 'TimeoutError')), 20000);
  let data: ArrayBuffer;
  try {
    const response = await fetchTile(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Geology tile request failed (${response.status})`);
    data = await response.arrayBuffer();
  } catch (error) {
    if (!signal.aborted) report('Some geology tiles are unavailable. Connect and view this area at this zoom level before using it offline.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
  signal.throwIfAborted();
  try { await store.put(url, data); }
  catch (error) {
    if (requireSaved) throw error;
    report('Geology is visible, but could not be saved offline. Device storage may be full.');
  }
  return { data };
}

export function registerGeologyProtocol(maplibre: Pick<typeof import('maplibre-gl'), 'addProtocol'>) {
  maplibre.addProtocol(GEOLOGY_PROTOCOL, (request, controller) => loadGeologyTile(request.url, controller.signal));
}

export interface GeologyArea {
  id: string;
  name: string;
  bounds: [number, number, number, number];
  savedAt: string;
  tiles: number;
}
export async function geologyAreas(area?: GeologyArea): Promise<GeologyArea[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('meta', area ? 'readwrite' : 'readonly');
      const store = tx.objectStore('meta');
      if (area) store.put(area, `area:${area.id}`);
      const request = store.getAll(IDBKeyRange.bound('area:', 'area:\uffff'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
