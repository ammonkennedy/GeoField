import test from 'node:test';
import assert from 'node:assert/strict';
import { geologyAreaTiles, downloadGeologyArea, GEOLOGY_MAX_ZOOM } from './geology-download.ts';
import { loadGeologyTile } from './geology-tile-cache.ts';
const bounds: [number, number, number, number] = [-111.01, 40, -111, 40.01];

test('area includes all zooms and valid tile coordinates without duplicates', () => {
  const tiles = geologyAreaTiles(bounds);
  assert.equal(new Set(tiles).size, tiles.length);
  const zooms = new Set<number>();
  for (const url of tiles) {
    const [, z, x, y] = url.match(/carto\/(\d+)\/(\d+)\/(\d+)\.mvt/)!.map(Number);
    zooms.add(z); assert.ok(x >= 0 && x < 2 ** z && y >= 0 && y < 2 ** z);
  }
  assert.equal(zooms.size, GEOLOGY_MAX_ZOOM + 1);
});
test('small areas crossing the date line wrap without requesting the world', () => {
  const tiles = geologyAreaTiles([179.99, 0, -179.99, 0.01]);
  assert.ok(tiles.length < 100);
  assert.ok(tiles.some(url => url.includes('/14/0/')));
  assert.ok(tiles.some(url => url.includes('/14/16383/')));
});
test('oversized and invalid areas are rejected before downloads', () => {
  assert.throws(() => geologyAreaTiles([-180, -85, 180, 85]), /too large/);
  assert.throws(() => geologyAreaTiles([NaN, 0, 1, 1]), /Invalid/);
});
test('download only marks area complete after every tile is saved, with bounded concurrency', async () => {
  let active = 0, peak = 0, finished = 0;
  const total = geologyAreaTiles(bounds).length;
  const area = await downloadGeologyArea('Test area', bounds, new AbortController().signal, () => {}, async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--; finished++;
    return { data: new ArrayBuffer(0) };
  }, async saved => { assert.equal(finished, total); return [saved!]; });
  assert.equal(area.tiles, total); assert.ok(peak <= 3);
});
test('failed and cancelled downloads never create a completed area', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let writes = 0;
    await assert.rejects(downloadGeologyArea('Test', bounds, controller.signal, () => {}, async () => {
      if (cancel) controller.abort();
      else throw new Error('Storage full');
      return { data: new ArrayBuffer(0) };
    }, async () => { writes++; return []; }));
    assert.equal(writes, 0);
  }
});
test('explicit downloads propagate storage quota errors instead of reporting success', async () => {
  const store = { get: async () => undefined, put: async () => { throw new Error('Quota'); } };
  await assert.rejects(loadGeologyTile(geologyAreaTiles(bounds)[0], new AbortController().signal, store,
    async () => new Response(new Uint8Array([1])), true), /Quota/);
});
