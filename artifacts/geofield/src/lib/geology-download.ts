import { GEOLOGY_PROTOCOL, loadGeologyTile, geologyTileStore, geologyAreas, type GeologyArea } from './geology-tile-cache.ts';
export const GEOLOGY_MAX_ZOOM = 14;
const MAX_TILES = 600;
const latitudeLimit = 85.05112878;
/** Include every zoom level, with wrapped longitudes for date-line crossings. */
export function geologyAreaTiles(bounds: [number, number, number, number]): string[] {
  let [west, south, east, north] = bounds;
  if (!bounds.every(Number.isFinite) || south >= north || south < -90 || north > 90) throw new Error('Invalid map area.');
  if (east < west) east += 360;
  if (east - west > 360 || east <= west) throw new Error('Choose a smaller map area.');
  const result = new Set<string>();
  for (let z = 0; z <= GEOLOGY_MAX_ZOOM; z++) {
    const size = 2 ** z;
    const x = (lng: number) => Math.floor((lng + 180) / 360 * size);
    const y = (lat: number) => {
      const radians = Math.max(-latitudeLimit, Math.min(latitudeLimit, lat)) * Math.PI / 180;
      return Math.max(0, Math.min(size - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * size)));
    };
    for (let row = y(north); row <= y(south); row++) {
      for (let col = x(west); col <= x(east); col++) {
        result.add(`${GEOLOGY_PROTOCOL}://tiles.macrostrat.org/carto/${z}/${((col % size) + size) % size}/${row}.mvt`);
        if (result.size > MAX_TILES) throw new Error('This area is too large. Zoom in and download smaller areas separately.');
      }
    }
  }
  return [...result];
}

export async function downloadGeologyArea(
  name: string, bounds: GeologyArea['bounds'], signal: AbortSignal,
  progress: (done: number, total: number) => void,
  load = (url: string, signal: AbortSignal) => loadGeologyTile(url, signal, geologyTileStore, fetch, true),
  save = geologyAreas,
): Promise<GeologyArea> {
  const tiles = geologyAreaTiles(bounds);
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, { once: true });
  const requestSignal = controller.signal;
  let cursor = 0, done = 0;
  progress(0, tiles.length);
  // Keep requests modest; partial downloads are reused on retry.
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < tiles.length) {
      requestSignal.throwIfAborted();
      const url = tiles[cursor++];
      try { await load(url, requestSignal); }
      catch (error) { controller.abort(error); throw error; }
      progress(++done, tiles.length);
    }
  });
  const results = await Promise.allSettled(workers);
  signal.removeEventListener("abort", abort);
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  signal.throwIfAborted();
  const area: GeologyArea = { id: crypto.randomUUID(), name: name.trim() || 'Geology field area', bounds, savedAt: new Date().toISOString(), tiles: tiles.length };
  await save(area);
  return area;
}
