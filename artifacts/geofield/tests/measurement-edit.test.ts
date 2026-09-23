import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMeasurementEdit, validMeasurementAngle } from '../src/lib/measurement-edit.ts';
import { lineationOrientationFromVector } from '../src/lib/strike-dip-math.ts';
import type { StrikeDipMeasurement } from '../src/lib/strike-dip-measurements.ts';
const measurement: StrikeDipMeasurement = { id: 'm', label: 'Outcrop', strike: '45', dip: '30', dipDegrees: 30, dipDir: '135', location: 'GPS', date: '', featureType: '', rockLayerType: '', notes: '', latitude: 40.123, longitude: -111.123, photoKey: 'new-photo', datasetId: 'new-dataset', cloudUpdatedAt: 'cloud-version' };
test('blank, malformed and out-of-range angles cannot become saved zeroes; actual zero stays valid', () => {
  for (const value of ['', ' ', 'abc', '1..2', '-1', 'Infinity', '360']) assert.equal(validMeasurementAngle(value, 360, true), null);
  assert.equal(validMeasurementAngle('0', 360, true), 0);
  assert.equal(validMeasurementAngle('359.9', 360, true), 359.9);
  assert.equal(validMeasurementAngle('90', 90), 90);
  assert.equal(validMeasurementAngle('90.1', 90), null);
});
test('editing text preserves concurrent GPS, dataset, photo and sync bookkeeping', () => {
  const next = applyMeasurementEdit(measurement, { featureType: 'Custom fabric' });
  assert.deepEqual(next, { ...measurement, featureType: 'Custom fabric' });
});
test('plane edits update numeric values used by mapping and keep zero dip', () => {
  const next = applyMeasurementEdit(measurement, { strike: '350', dip: '0' });
  assert.equal(next.strikeDegrees, 350);
  assert.equal(next.dipDegrees, 0);
  assert.equal(next.dipDirectionDegrees, 80);
  assert.equal(next.quality, 'manual');
  assert.equal(measurement.dipDegrees, 30);
  assert.throws(() => applyMeasurementEdit(measurement, { dip: '' }));
});
test('lineation edits update the vector and preserve plunge without applying calibration twice', () => {
  const next = applyMeasurementEdit({ ...measurement, measurementType: 'lineation', trendDegrees: 123, plungeDegrees: 28 }, { trendDegrees: 0 });
  const orientation = lineationOrientationFromVector(next.lineVector!)!;
  assert.equal(orientation.trend, 0);
  assert.ok(Math.abs(orientation.plunge - 28) < 1e-8);
  assert.equal(next.trendDegrees, 0);
});
