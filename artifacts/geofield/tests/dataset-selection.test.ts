import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetOptions, datasetSelected, datasetSelectionLabel, toggleDataset } from '../src/lib/dataset-selection.ts';
const identities = [{ id: 'local-a', cloudId: 'cloud-a' }];
const options = datasetOptions([{ id: 'cloud-a', name: 'A' }, { id: 2, name: 'B' }], identities, ['local-a', 'cloud-a', 2, null, 'missing']);
test('dataset choices count aliases together and retain uncategorized and unloaded datasets', () => {
  assert.deepEqual(options, [
    { id: 'cloud-a', name: 'A', count: 2 }, { id: '2', name: 'B', count: 1 },
    { id: '', name: 'Uncategorized', count: 1 }, { id: 'missing', name: 'Project missing', count: 1 },
  ]);
});
test('multiple datasets filter records once and survive local-to-cloud identity changes', () => {
  const records = [{ id: 1, datasetId: 'cloud-a' }, { id: 2, datasetId: 'local-a' }, { id: 3, datasetId: 2 }, { id: 4, datasetId: null }];
  assert.deepEqual(records.filter(item => datasetSelected(['local-a', '2'], item.datasetId, identities)).map(item => item.id), [1, 2, 3]);
  assert.equal(datasetSelected([], null, identities), false);
  assert.equal(datasetSelected([''], undefined, identities), true);
  assert.equal(datasetSelected('all', 'unknown', identities), true);
});
test('unchecking one from all retains other datasets; toggling again restores it', () => {
  const selected = toggleDataset('all', 'cloud-a', options, identities);
  assert.deepEqual(selected, ['2', '', 'missing']);
  assert.deepEqual(toggleDataset(selected, 'cloud-a', options, identities), ['2', '', 'missing', 'cloud-a']);
  assert.deepEqual(toggleDataset(['local-a'], 'cloud-a', options, identities), []);
  assert.equal(datasetSelectionLabel([], options, identities), 'No projects selected');
  assert.equal(datasetSelectionLabel(['local-a', '2'], options, identities), 'A, B');
});
