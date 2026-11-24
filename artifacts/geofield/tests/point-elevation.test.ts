import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTerrainHeight, terrainPixel, lookupPointElevation } from '../src/lib/point-elevation.ts';
test('terrain decoding distinguishes sea level, below sea level and mountain elevation', () => {
  assert.equal(decodeTerrainHeight(128, 0, 0), 0);
  assert.equal(decodeTerrainHeight(127, 255, 128), -0.5);
  assert.equal(decodeTerrainHeight(139, 184, 0), 3000);
});
test('terrain pixels remain inside their tiles at the equator and world boundaries', () => {
  assert.deepEqual(terrainPixel(0, 0), { url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2048/2048.png', x: 0, y: 0 });
  for (const latitude of [-85.05112878, -1.5, 0, 85.05112878]) {
    for (const longitude of [-180, -78.5, 0, 180]) {
      const pixel = terrainPixel(latitude, longitude);
      assert.ok(pixel.x >= 0 && pixel.x < 256 && pixel.y >= 0 && pixel.y < 256);
      assert.ok(!pixel.url.includes('/4096'));
    }
  }
});
test('unavailable terrain stays unavailable rather than becoming zero', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try { assert.equal(await lookupPointElevation(-1.5, -78.5, new AbortController().signal), null); }
  finally { globalThis.fetch = original; }
});
