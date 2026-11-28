import { test } from 'node:test';
import assert from 'node:assert/strict';
import { histogram, correlation, linePoints } from '../src/lib/figure-statistics.ts';

test('histogram preserves every finite reading, including the upper endpoint and zero', () => {
  const bins = histogram([-2, -1, 0, 1, 2, NaN], 2);
  assert.deepEqual(bins.map(bin => bin.count), [2, 3]);
  assert.equal(bins[1].upper, 2);
  assert.deepEqual(histogram([7, 7], 10), [{ lower: 7, upper: 7, count: 2 }]);
  assert.deepEqual(histogram([], 10), []);
});

test('Pearson correlation uses paired values only, preserves zero, and handles undefined cases', () => {
  const rows = [{ x: 0, y: 6 }, { x: '1', y: 4 }, { x: 2, y: 2 }, { x: 50, y: '' }, { x: null, y: 20 }];
  const result = correlation(rows, 'x', 'y');
  assert.equal(result.n, 3);
  assert.ok(Math.abs(result.r! + 1) < 1e-12);
  assert.equal(correlation(rows, 'y', 'x').r, result.r);
  assert.equal(correlation([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], 'x', 'y').r, null);
  assert.equal(correlation(rows.slice(0, 2), 'x', 'y').r, null);
  assert.equal(correlation([{ x: 1e200, y: 1 }, { x: 2e200, y: 2 }, { x: 3e200, y: 3 }], 'x', 'y').r, 1);
});

test('line chart sorts numeric X, keeps missing Y as gaps and does not mutate input', () => {
  const records = [{ name: 'C', values: { x: 3, y: 4 } }, { name: 'A', values: { x: 1, y: 0 } }, { name: 'B', values: { x: 2, y: '' } }];
  assert.deepEqual(linePoints(records, 'y', 'x'), [
    { name: 'A', x: 1, value: 0 }, { name: 'B', x: 2, value: null }, { name: 'C', x: 3, value: 4 },
  ]);
  assert.equal(records[0].name, 'C');
  assert.equal(linePoints(records, 'y', '')[0].x, 1);
  assert.deepEqual(linePoints([{ name: 'missing', values: { y: 3 } }], 'y', 'x'), []);
});
