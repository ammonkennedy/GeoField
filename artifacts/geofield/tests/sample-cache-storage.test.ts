import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBObjectStore } from 'fake-indexeddb';
import { sampleStorageFixture } from './sample-storage-fixture.ts';
import { initializeSampleCache, readSampleCache, mutateSampleCache, removeAccountSampleCache } from '../src/lib/sample-cache-storage.ts';
const key = 'geofield_cloud_samples:account:fixture-owner';

test('large legacy sample cache migrates without copying into full localStorage and survives reopening', async () => {
  const values = await sampleStorageFixture();
  // A distinct account has no committed database copy yet.
  values.set('geofield-account:pool', JSON.stringify({user:{id:'large-owner'}}));
  const rows = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), fields: { notes: 'field data '.repeat(400) } }));
  const scoped = key.replace('fixture-owner', 'large-owner');
  values.set(scoped, JSON.stringify(rows));
  values.set(`${scoped}__backup`, JSON.stringify(rows));
  localStorage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  await initializeSampleCache(true);
  assert.equal(values.has(scoped), false);
  assert.equal(values.has(`${scoped}__backup`), false);
  assert.deepEqual(readSampleCache(), rows);
  await mutateSampleCache(previous => [...previous, { id: 'new-offline' }]);
  await initializeSampleCache(true);
  assert.equal(readSampleCache().length, 2001);
});

test('migration never replaces corrupt local data with an empty database', async () => {
  const values = await sampleStorageFixture();
  values.set('geofield-account:pool', JSON.stringify({user:{id:'corrupt-owner'}}));
  const scoped = key.replace('fixture-owner', 'corrupt-owner');
  values.set(scoped, 'corrupt');
  values.set(`${scoped}__backup`, 'also corrupt');
  await assert.rejects(initializeSampleCache(true), /preserved/);
  assert.equal(values.get(scoped), 'corrupt');
  values.set(`${scoped}__backup`, '[{"id":"recovered"}]');
  await initializeSampleCache(true);
  assert.deepEqual(readSampleCache(), [{id:'recovered'}]);
});

test('database failure preserves legacy bytes and failed writes preserve committed cache', async () => {
  const values = await sampleStorageFixture();
  await mutateSampleCache(() => [{id:'saved'}]);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); };
  try {
    await assert.rejects(mutateSampleCache(() => [{id:'unsaved'}]), /full/);
    assert.deepEqual(readSampleCache(), [{id:'saved'}]);
    values.set('geofield-account:pool', JSON.stringify({user:{id:'migrating'}}));
    const scoped = key.replace('fixture-owner', 'migrating');
    values.set(scoped, '[{"id":"original"}]');
    await assert.rejects(initializeSampleCache(true), /full/);
    assert.equal(values.get(scoped), '[{"id":"original"}]');
  } finally { IDBObjectStore.prototype.put = original; }
});

test('concurrent cache updates merge from committed data and account deletion is isolated', async () => {
  const values = await sampleStorageFixture();
  await Promise.all(Array.from({length: 20}, (_, id) => mutateSampleCache(previous => [...previous, {id}])));
  assert.equal(readSampleCache().length, 20);
  values.set('geofield-account:pool', JSON.stringify({user:{id:'second'}}));
  await initializeSampleCache();
  assert.deepEqual(readSampleCache(), []);
  await mutateSampleCache(() => [{id:'second-data'}]);
  await removeAccountSampleCache('fixture-owner');
  assert.deepEqual(readSampleCache(), [{id:'second-data'}]);
});

test('account switch before transaction commits prevents saving under another account', async () => {
  const values = await sampleStorageFixture();
  const pending = mutateSampleCache(() => [{id:'wrong-owner'}]);
  values.set('geofield-account:pool', JSON.stringify({user:{id:'other'}}));
  await assert.rejects(pending, /account changed/i);
});
