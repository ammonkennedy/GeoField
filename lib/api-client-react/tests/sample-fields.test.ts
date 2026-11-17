import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSampleFields, sampleUpdateCondition } from '../src/sample-fields.ts';
test('water sample values retain zeros, qualifiers, custom fields and full GPS precision', () => {
  const fields = { ph: 0, temperature: -0.5, do: '<0.01', conductivity: 12.3456789, location: '-0.180653,-78.467834', waterSource: 'Surface water', preservation: 'HNO3', notes: 'Río frío', customParams: [{ label: 'Bottle', value: '0007' }], media: [{ storageKey: 'media/photo' }] };
  assert.deepEqual(parseSampleFields(JSON.stringify(fields)), fields);
});
test('malformed cloud sample data blocks editing rather than producing an empty sample', () => {
  for (const value of ['broken json', '[]', 'null', '7', []]) assert.throws(() => parseSampleFields(value), /could not be read|invalid format/);
  assert.deepEqual(parseSampleFields(null), {});
});
test('server-side sample revision condition requires the original timestamp', () => {
  assert.deepEqual(sampleUpdateCondition('original'), { updatedAt: { eq: 'original' } });
  assert.throws(() => sampleUpdateCondition(''), /revision/);
});
