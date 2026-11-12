import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeologyTile, geologyCacheWarning } from './geology-tile-cache.ts';
const url = 'geofield-geology://tiles.macrostrat.org/carto/8/49/96.mvt';
const bytes = new Uint8Array([1, 2, 3]).buffer;
const signal = () => new AbortController().signal;

test('viewed tiles survive a new loader session without a network request', async () => {
  const saved = new Map<string, ArrayBuffer>();
  const store = { get: async (key: string) => saved.get(key), put: async (key: string, data: ArrayBuffer) => { saved.set(key, data); } };
  await loadGeologyTile(url, signal(), store, async input => {
    assert.equal(input, 'https://tiles.macrostrat.org/carto/8/49/96.mvt');
    return new Response(bytes);
  });
  const result = await loadGeologyTile(url, signal(), store, async () => { throw new Error('No service'); });
  assert.deepEqual(result.data, bytes);
});

test('uncached offline areas fail explicitly instead of being saved as empty tiles', async () => {
  let writes = 0;
  const store = { get: async () => undefined, put: async () => { writes++; } };
  await assert.rejects(loadGeologyTile(url, signal(), store, async () => { throw new Error('Offline'); }), /Offline/);
  assert.equal(writes, 0);
  assert.match(geologyCacheWarning(), /unavailable/);
});

test('storage failure does not break online geology or hide the offline failure', async () => {
  const store = { get: async () => { throw new Error('Unavailable'); }, put: async () => { throw new Error('Quota'); } };
  const result = await loadGeologyTile(url, signal(), store, async () => new Response(bytes));
  assert.deepEqual(result.data, bytes);
  assert.match(geologyCacheWarning(), /could not be saved/);
});

test('HTTP errors are not cached and cancellation prevents new downloads', async () => {
  let writes = 0;
  const store = { get: async () => undefined, put: async () => { writes++; } };
  await assert.rejects(loadGeologyTile(url, signal(), store, async () => new Response('', { status: 503 })), /503/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadGeologyTile(url, controller.signal, store, async () => { throw new Error('Must not fetch'); }), { name: 'AbortError' });
  assert.equal(writes, 0);
});
