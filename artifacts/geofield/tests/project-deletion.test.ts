import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/project-deletion.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const project = { id: -1, cloudId: 'project', name: 'Water fieldwork' };
  const state: any = {
    queue: [{ queuedId: 'q', payload: { sampleId: 'Water', folderId: -1, fields: { ph: 0, media: ['original'] } } }],
    measurements: [{ id: 'm', datasetId: 'project', label: 'Plane', dip: 30 }],
    tracks: [{ id: 't', datasetId: 'project', name: 'Route', points: [{ lat: 1 }] }],
    nets: [{ id: 'n', name: 'Net', savedDatasetId: 'project', groups: [], measurements: [] }],
    trips: [{ id: 'trip', name: 'Trip', cloudDatasetId: 'project', sites: [{ id: 'site' }] }], trash: [], active: null,
  };
  const merge = (key: string, values: any[]) => { for (const value of values) { const i = state[key].findIndex((v: any) => v.id === value.id); if (i < 0) state[key].push(value); else state[key][i] = value; } };
  const api: any = {
    getQueue: () => state.queue, setQueue: (v: any) => { state.queue = v; },
    getCachedCloudSamples: () => [], getLocalDatasets: () => [project],
    loadMeasurements: () => state.measurements, saveMeasurements: (v: any) => { state.measurements = v; },
    loadTracks: () => state.tracks.filter((v: any) => !v.deletedAt), storeTracks: async (v: any) => merge('tracks', v), trackingStatus: () => ({ activeId: state.active }),
    loadTrips: () => state.trips.filter((v: any) => !v.deletedAt), saveTrips: (v: any) => merge('trips', v),
    loadStereonets: () => state.nets.filter((v: any) => !v.deletedAt), saveStereonet: (v: any) => merge('nets', [v]),
    stereonetInDataset: (v: any) => v.savedDatasetId === 'project',
    archiveLocalItem: (kind: string, name: string, data: any) => { if (state.failArchive) throw Error('Storage full'); state.trash.push({ kind, name, data, trashId: kind }); },
    removeLocalDeletedItem: (id: string) => { state.trash = state.trash.filter((v: any) => v.trashId !== id); },
    assertStorageAccount: (id: string) => { if (id !== 'owner') throw Error('Account changed'); },
  };
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: () => api, crypto: { randomUUID: () => 'revision' }, console });
  return { state, project, ...exports };
}
test('project only detaches every collection and preserves all values', async () => {
  const f = fixture();
  await f.applyProjectContents(f.project, 'project-only', 'owner');
  assert.equal(f.state.queue[0].payload.folderId, null);
  assert.equal(f.state.queue[0].payload.fields.ph, 0);
  assert.equal(f.state.measurements[0].datasetId, null);
  assert.equal(f.state.tracks[0].datasetId, null);
  assert.equal(f.state.tracks[0].points.length, 1);
  assert.equal(f.state.nets[0].savedDatasetId, undefined);
  assert.equal(f.state.trips[0].sites.length, 1);
  assert.equal(f.state.trips[0].cloudDatasetId, null);
  assert.equal(f.state.trash.length, 0);
});
test('delete data archives all content, retains media and routes, and is retry safe', async () => {
  const f = fixture();
  await f.applyProjectContents(f.project, 'delete-data', 'owner');
  assert.equal(f.state.trash.length, 5);
  for (const key of ['queue', 'measurements', 'tracks', 'nets', 'trips']) assert.ok(f.state[key][0].deletedAt);
  assert.equal(f.state.trash[0].data.payload.fields.media[0], 'original');
  await f.applyProjectContents(f.project, 'delete-data', 'owner');
  assert.equal(f.state.trash.length, 5);
  const track = f.state.trash.find((v: any) => v.kind === 'track');
  await f.restoreProjectContent(track, 'owner');
  const restored = f.state.tracks.find((v: any) => v.id === 'restored-track');
  assert.equal(restored.points.length, 1);
  assert.equal(restored.deletedAt, undefined);
  assert.ok(f.state.tracks[0].deletedAt, 'original tombstone remains to prevent stale resurrection');
});
test('active recording, wrong account and failed archival prevent destructive writes', async () => {
  for (const reason of ['active', 'account', 'storage']) {
    const f = fixture();
    if (reason === 'active') f.state.active = 't';
    if (reason === 'storage') f.state.failArchive = true;
    await assert.rejects(f.applyProjectContents(f.project, 'delete-data', reason === 'account' ? 'other' : 'owner'));
    assert.equal(f.state.queue[0].deletedAt, undefined);
    assert.equal(f.state.tracks[0].points.length, 1);
  }
});

test('records belonging to other projects are never detached or deleted', async () => {
  const f = fixture();
  f.state.queue.push({ queuedId: 'other-q', payload: { folderId: 'other', fields: { ph: 7 } } });
  f.state.tracks.push({ id: 'other-track', datasetId: 'other', points: [1, 2] });
  f.state.measurements.push({ id: 'other-measurement', datasetId: 'other', dip: 60 });
  await f.applyProjectContents(f.project, 'delete-data', 'owner');
  assert.equal(f.state.queue[1].payload.folderId, 'other');
  assert.equal(f.state.queue[1].deletedAt, undefined);
  assert.equal(f.state.tracks[1].datasetId, 'other');
  assert.equal(f.state.measurements[1].deletedAt, undefined);
});
