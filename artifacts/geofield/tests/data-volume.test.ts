import { syncQueuedSample } from '../src/lib/sync-sample-queue.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildDatasetWorkbook } from '../src/lib/export.ts';
import { DEFAULT_FORMAT_CONFIG } from '../src/lib/export-config.ts';
import { syncMeasurementRecords } from '../src/lib/sync-measurements.ts';
import { mergeMeasurements } from '../src/lib/merge-measurements.ts';
import type { StrikeDipMeasurement } from '../src/lib/strike-dip-measurements.ts';
const date = '2026-09-22T12:00:00Z';
const measurements: StrikeDipMeasurement[] = Array.from({ length: 1001 }, (_, i) => ({
  id: `m${i}`, label: `Measurement ${i}`, measurementType: i % 2 ? 'lineation' : 'plane',
  strike: i % 2 ? '' : '45', dip: i % 2 ? '' : '30', dipDir: i % 2 ? '' : '135',
  trendDegrees: i % 2 ? 123 : undefined, plungeDegrees: i % 2 ? 28 : undefined,
  datasetId: `d${i % 20}`, location: '40.25, -111.65', latitude: 40.25, longitude: -111.65,
  date, createdAt: date, updatedAt: date, featureType: `Custom feature ${i}`, rockLayerType: `Custom rock ${i}`, notes: 'Field notes', localRevision: `r${i}`,
}));
test('exports 1,000 samples and 1,001 measurements across 20 datasets without missing or shifted rows', () => {
  const start = performance.now();
  const samples = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, sampleId: `Sample ${i}`, sampleType: ['rock', 'water', 'soil_sand', 'air', 'other'][i % 5], folderId: `d${i % 20}`, createdAt: date, fields: {}, notes: '' }));
  const workbook = buildDatasetWorkbook({ samples: samples as any, measurements, datasets: Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, name: `Dataset ${i}` })), folderName: 'All', filename: 'volume-test', sampleColumnsByType: {}, sampleConfig: DEFAULT_FORMAT_CONFIG })!;
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const saved = XLSX.read(buffer, { type: 'buffer' });
  let count = 0;
  for (const name of ['Rock', 'Water', 'Soil', 'Air', 'Other']) count += XLSX.utils.sheet_to_json(saved.Sheets[name]).length;
  assert.equal(count, 1000);
  const rows = XLSX.utils.sheet_to_json(saved.Sheets.Measurements) as any[];
  assert.equal(rows.length, 1001);
  rows.forEach((row, i) => { assert.equal(row.Label, `Measurement ${i}`); assert.equal(row['Feature Type'], `Custom feature ${i}`); assert.equal(row['Rock / Layer Type'], `Custom rock ${i}`); assert.equal(row.Dataset, `Dataset ${i % 20}`); });
  console.log(JSON.stringify({ exportRecords: count + rows.length, exportMs: Math.round(performance.now() - start), xlsxBytes: buffer.length }));
});
test('1,001-measurement sync retains a failed middle record, retries it, and downloads on a second device', async () => {
  const start = performance.now();
  let local = structuredClone(measurements);
  const remote = new Map<string, StrikeDipMeasurement>();
  let fail = true, writes = 0;
  const saveRemote = async (item: StrikeDipMeasurement) => {
    if (fail && item.id === 'm500') throw new Error('Simulated connection loss');
    writes++;
    const saved = { ...item, updatedAt: '2026-09-22T13:00:00Z' };
    remote.set(item.id, saved);
    return structuredClone(saved);
  };
  const store = { load: () => structuredClone(local), save: (items: StrikeDipMeasurement[]) => { local = structuredClone(items); }, list: async () => structuredClone([...remote.values()]), get: async (id: string) => structuredClone(remote.get(id) ?? null), create: saveRemote, update: saveRemote };
  await assert.rejects(syncMeasurementRecords(store), /Simulated connection loss/);
  assert.equal(remote.size, 1000);
  assert.equal(local.length, 1001);
  assert.deepEqual(local.filter(item => item.localRevision).map(item => item.id), ['m500']);
  fail = false;
  await syncMeasurementRecords(store);
  assert.equal(writes, 1001);
  assert.equal(remote.size, 1001);
  assert.equal(local.filter(item => item.localRevision).length, 0);
  const second = mergeMeasurements([], [...remote.values()], []);
  assert.equal(second.length, 1001);
  second.forEach(item => { const original = measurements.find(m => m.id === item.id)!; assert.equal(item.datasetId, original.datasetId); assert.equal(item.featureType, original.featureType); assert.equal(item.rockLayerType, original.rockLayerType); });
  console.log(JSON.stringify({ syncedMeasurements: remote.size, writes, simulatedSyncMs: Math.round(performance.now() - start) }));
});


test('1,000 queued samples survive an interrupted upload and resume without duplication', async () => {
  let queue = Array.from({ length: 1000 }, (_, i) => ({ queuedId: `q${i}`, queuedAt: date, payload: { sampleId: `Sample ${i}`, sampleType: 'rock', folderId: `d${i % 20}`, fields: { rockType: `Custom rock ${i}` }, notes: 'Field notes' } }));
  const remote = new Map<string, any>(), cache = new Map<string, any>();
  let connected = true;
  const store = {
    load: () => structuredClone(queue), prepare: async (item: typeof queue[number]) => item.payload,
    create: async (id: string, payload: typeof queue[number]['payload']) => { if (!connected) throw new Error('Offline'); const saved = { id, ...payload }; remote.set(id, saved); return saved; },
    update: async () => { throw new Error('Unexpected update'); },
    get: async (id: string) => { if (!connected) throw new Error('Offline'); return remote.get(id); },
    cache: (saved: any) => { cache.set(saved.id, saved); },
    remove: (id: string) => { assert.ok(cache.has(id), 'cache must be saved before removing queued data'); queue = queue.filter(item => item.queuedId !== id); },
  };
  for (const item of [...queue].slice(0, 500)) await syncQueuedSample(item, store);
  connected = false;
  await assert.rejects(syncQueuedSample(queue[0], store), /Offline/);
  assert.equal(queue.length, 500);
  connected = true;
  for (const item of [...queue]) await syncQueuedSample(item, store);
  assert.equal(queue.length, 0);
  assert.equal(remote.size, 1000);
  assert.equal(cache.size, 1000);
  for (let i = 0; i < 1000; i++) { assert.equal(remote.get(`q${i}`).folderId, `d${i % 20}`); assert.equal(remote.get(`q${i}`).fields.rockType, `Custom rock ${i}`); }
});
