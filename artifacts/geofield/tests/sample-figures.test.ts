import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFigureFields, figureParameters, figureNumber } from '../src/lib/sample-figures.ts';

test('custom readings across sample types and stored formats are available on either axis', () => {
  const records = [
    { sampleType: 'water', fields: { ph: 7, customParams: [{ label: 'Salinity (ppt)', value: '0' }, { label: 'Comment', value: 'clear' }] } },
    { sampleType: 'rock', fields: { customParams: JSON.stringify([{ label: ' salinity (ppt) ', value: '2.5' }]) } },
    { sampleType: 'other', fields: { customParams: { 'Density': '-1.2e2' } } },
  ].map(sampleFigureFields);
  const options = figureParameters(records);
  const salinity = options.find(([, meta]) => meta.label.startsWith('Salinity'))![0];
  assert.equal(options.filter(([, meta]) => /salinity/i.test(meta.label)).length, 1);
  assert.equal(figureNumber(records[0].values[salinity]), 0);
  assert.equal(figureNumber(records[1].values[salinity]), 2.5);
  assert.equal(figureNumber(records[2].values[salinity]), undefined);
  assert.ok(options.some(([, meta]) => meta.label.startsWith('Density')));
  assert.ok(!options.some(([, meta]) => meta.label.startsWith('Comment')));
  assert.equal(figureNumber(records[0].values.ph), 7);
});

test('custom names do not overwrite built-ins; duplicate readings and different units stay distinct', () => {
  const sample = { sampleType: 'water', fields: { ph: 7, customParams: [
    { label: 'ph', value: 8 },
    { label: 'Pressure', value: '' },
    { label: 'Pressure mm Hg', value: '760' },
    { label: 'Barometric Pressure (mmHg)', value: '761' },
    { label: 'Pressure (kPa)', value: '101' },
  ] } };
  const before = JSON.stringify(sample);
  const record = sampleFigureFields(sample);
  const options = figureParameters([record]);
  assert.equal(options.length, 5);
  assert.equal(record.values.ph, 7);
  const customPh = options.find(([, meta]) => meta.label === 'ph — Custom')![0];
  assert.equal(record.values[customPh], 8);
  assert.ok(options.some(([, meta]) => meta.label.includes('reading 2')));
  assert.equal(JSON.stringify(sample), before);
});

test('missing, malformed, nonfinite and nonnumeric readings never become zero', () => {
  for (const value of ['', ' ', null, undefined, true, [], {}, 'NaN', Infinity, '12 mg/L']) {
    assert.equal(figureNumber(value), undefined);
  }
  assert.equal(figureNumber('0'), 0);
  assert.deepEqual(figureParameters([sampleFigureFields({ sampleType: 'soil_sand', fields: { customParams: '{broken' } })]), []);
});
