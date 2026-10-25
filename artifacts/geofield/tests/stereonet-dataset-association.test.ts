import test from 'node:test';
import assert from 'node:assert/strict';
import { stereonetInDataset } from '../src/lib/stereonet/dataset-association.ts';
import { newStereonet, importMeasurement } from '../src/lib/stereonet/model.ts';
import type { StrikeDipMeasurement } from '../src/lib/strike-dip-measurements.ts';
test('multi-dataset stereonets appear in each source dataset and resolve offline IDs', () => {
  const net=newStereonet('Combined');
  net.groups=[{...net.groups[0],sourceDatasetId:'-12'}, {...net.groups[0],id:'second',sourceDatasetId:'other'}];
  const identities=[{id:-12,cloudId:'cloud'}];
  assert.equal(stereonetInDataset(net,'cloud',identities),true);
  assert.equal(stereonetInDataset(net,'other',identities),true);
  assert.equal(stereonetInDataset(net,'unrelated',identities),false);
  assert.equal(stereonetInDataset({...net,deletedAt:'2026-10-25'},'cloud',identities),false);
});
test('legacy per-measurement imports retain their dataset association', () => {
  const net=newStereonet('Legacy');
  net.measurements=[importMeasurement({id:'m',label:'Plane',strike:'20',dip:'40',datasetId:8} as StrikeDipMeasurement, net.groups[0].id)];
  assert.equal(stereonetInDataset(net,'8'),true);
  assert.equal(stereonetInDataset(net,'9'),false);
  assert.equal(stereonetInDataset(newStereonet('Unassigned'),'8'),false);
});
