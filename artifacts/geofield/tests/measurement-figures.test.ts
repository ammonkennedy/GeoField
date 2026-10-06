import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measurementFigureRecords } from '../src/lib/measurement-figures.ts';

test('plane and lineation expose their own angle fields including valid zeroes', () => {
  const rows = measurementFigureRecords([
    { id: 'plane', label: 'Bedding', strike: '0', dip: '45' },
    { id: 'line', measurementType: 'lineation', trendDegrees: 359, plungeDegrees: 0, strike: '', dip: '' },
  ] as any);
  assert.deepEqual(rows[0].fields, { strike: 0, dip: 45 });
  assert.deepEqual(rows[1].fields, { azimuth: 359, plunge: 0 });
  assert.equal(rows[0].sampleId, 'Bedding');
});
test('missing and invalid angles are excluded instead of becoming zero', () => {
  const rows = measurementFigureRecords([
    { id: 'a', strike: ' ', dip: '' },
    { id: 'b', measurementType: 'lineation', trendDegrees: Infinity, plungeDegrees: 91 },
  ] as any);
  assert.deepEqual(rows[0].fields, { strike: undefined, dip: undefined });
  assert.deepEqual(rows[1].fields, { azimuth: undefined, plunge: undefined });
});
