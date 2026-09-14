import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeMeasurements } from '../src/lib/merge-measurements.ts';

const local = { id: 'plane', photo: 'data:image/jpeg;base64,photo', label: 'Local', updatedAt: '2026-09-01T00:00:00Z' };
const cloud = { id: 'plane', label: 'Cloud', updatedAt: '2026-09-02T00:00:00Z' };

test('newer and equal cloud records preserve local photos across repeated syncs', () => {
  for (const updatedAt of [cloud.updatedAt, local.updatedAt]) {
    const remote = { ...cloud, updatedAt };
    const result = mergeMeasurements([local], [remote], [local]);
    assert.equal(result[0].photo, local.photo);
    assert.equal(result[0].label, 'Cloud');
    assert.deepEqual(mergeMeasurements(result, [remote], result), result);
  }
});

test('photos and other edits made during sync win over the stale response', () => {
  const edited = { ...local, photo: 'data:image/jpeg;base64,new', label: 'Edited' };
  assert.deepEqual(mergeMeasurements([edited], [cloud], [local]), [edited]);
});

test('explicit photo removal during sync is preserved', () => {
  const edited = { ...local, photo: undefined };
  assert.deepEqual(mergeMeasurements([edited], [cloud], [local]), [edited]);
});

test('deletions during sync are not resurrected; new local records are retained', () => {
  const added = { ...local, id: 'new-local' };
  assert.deepEqual(mergeMeasurements([added], [cloud], [local]), [added]);
});

test('new remote measurements are added and older cloud data cannot replace newer local data', () => {
  const remoteNew = { ...cloud, id: 'lineation' };
  const newerLocal = { ...local, updatedAt: '2026-09-03T00:00:00Z' };
  assert.deepEqual(mergeMeasurements([newerLocal], [cloud, remoteNew], [newerLocal]), [newerLocal, remoteNew]);
});
