import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrder, moveParameter } from '../src/lib/sample-parameter-order.ts';

test('saved order survives serialization while new fields remain available', () => {
  const order = JSON.parse(JSON.stringify(moveParameter(['temperature', 'ph', 'color'], 1, -1)));
  assert.deepEqual(normalizeOrder(['temperature', 'ph', 'color', 'odor'], order), ['ph', 'temperature', 'color', 'odor']);
  assert.deepEqual(normalizeOrder(['ph', 'color'], ['removed', 'color', 'color']), ['color', 'ph']);
});

test('moving a custom parameter keeps its identity, name and entered value together', () => {
  const parameters = [{ id: 'a', label: 'Bottle', value: '0007' }, { id: 'b', label: 'pH', value: '0' }];
  const moved = moveParameter(parameters, 1, -1);
  assert.equal(moved[0], parameters[1]);
  assert.equal(moved[1], parameters[0]);
  assert.equal(parameters[0].value, '0007');
  assert.deepEqual(moveParameter(parameters, 0, -1), parameters);
  assert.deepEqual(moveParameter(parameters, 1, 1), parameters);
});

test('custom and built-in parameters share a persisted order; additions append last', () => {
  const keys = ['temperature', 'ph', 'custom-bottle'];
  const combined = moveParameter(keys, 2, -1);
  const saved = JSON.parse(JSON.stringify(combined));
  assert.deepEqual(normalizeOrder([...keys, 'custom-depth'], saved), ['temperature', 'custom-bottle', 'ph', 'custom-depth']);
  assert.deepEqual(normalizeOrder(['temperature', 'ph', 'custom-depth'], saved), ['temperature', 'ph', 'custom-depth']);
});
