import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { cropPrism, prismBounds, prismIndex, prismValue, prismCsv, PRISM_VARIABLES, type PrismData } from '../src/lib/prism.ts';
const fixture = (): PrismData => ({ accessed: '2026-09-24', grid: { width: 3, height: 2, west: -110, north: 40, step: 1 }, values: {
  ppt: new Float32Array([100, 200, -9999, 400, 500, 600]),
  tmean: new Float32Array([0, 10, -9999, 20, 30, 40]),
  tmin: new Float32Array([-10, 0, -9999, 10, 20, 30]),
  tmax: new Float32Array([10, 20, -9999, 30, 40, 50]),
} });
test('clicked cell uses west/north origin, correct row, and excludes outside boundaries', () => {
 const d = fixture();
 assert.equal(prismIndex(d.grid, -109.5, 39.5), 0);
 assert.equal(prismIndex(d.grid, -108.5, 38.5), 4);
 assert.equal(prismIndex(d.grid, -107, 39), null);
 assert.equal(prismIndex(d.grid, -111, 39), null);
 assert.equal(prismIndex(d.grid, -109, 38), null);
 assert.equal(prismIndex(d.grid, NaN, 39), null);
 assert.equal(prismValue(d, 'ppt', 2), null);
 assert.equal(prismValue(d, 'tmean', 0), 0);
});
test('regional downloads preserve all four variables and cell alignment', () => {
 const d = fixture(); const region = cropPrism(d, [-108.9, 38.1, -107.1, 39.9]);
 assert.deepEqual(prismBounds(region.grid), [-109, 38, -107, 40]);
 for (const v of PRISM_VARIABLES) assert.deepEqual([...region.values[v]], [d.values[v][1], d.values[v][2], d.values[v][4], d.values[v][5]]);
 assert.equal(prismValue(region, 'ppt', prismIndex(region.grid, -108.5, 38.5)), 500);
});
test('no-data and out-of-coverage regions are refused', () => {
 assert.throws(() => cropPrism(fixture(), [-107.9, 39.1, -107.1, 39.9]), /No PRISM/);
 assert.throws(() => cropPrism(fixture(), [0, 0, 5, 5]), /outside/);
});
test('CSV exports cell centres, real zero and negative values, units, period and attribution', () => {
 const csv = prismCsv(fixture());
 assert.equal(csv.split('\r\n').length, 6);
 assert.match(csv, /-109.5000000,39.5000000,100.00,0.00,-10.00,10.00/);
 assert.match(csv, /annual_precipitation_mm/);
 assert.match(csv, /1991-2020,4 km,"PRISM Group, Oregon State University",https:\/\/prism.oregonstate.edu,2026-09-24/);
 assert.doesNotMatch(csv, /-9999/);
});
test('bundled official grids have complete dimensions and physically consistent temperatures', () => {
 const root = new URL('../public/prism/', import.meta.url);
 const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
 const data = { grid: manifest.grid, accessed: manifest.accessed, values: {} } as PrismData;
 for (const v of PRISM_VARIABLES) {
  const buffer = gunzipSync(readFileSync(new URL(manifest.variables[v].file, root)));
  assert.equal(buffer.length, data.grid.width * data.grid.height * 4);
  const cells = new Float32Array(data.grid.width * data.grid.height);
  for (let i = 0; i < cells.length; i++) cells[i] = buffer.readFloatLE(i * 4);
  data.values[v] = cells;
 }
 const index = prismIndex(data.grid, -105.27, 40.015)!;
 assert.ok(prismValue(data, 'ppt', index)! > 100);
 assert.ok(prismValue(data, 'tmin', index)! < prismValue(data, 'tmean', index)!);
 assert.ok(prismValue(data, 'tmean', index)! < prismValue(data, 'tmax', index)!);
 assert.equal(prismValue(data, 'ppt', prismIndex(data.grid, -120, 25)), null);
});
