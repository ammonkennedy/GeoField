import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, getQueue, setQueue, updateQueuedSample, deleteQueuedSample } from '../src/lib/offline-queue.ts';
import { cacheCloudSamples } from '../src/lib/cloud-samples.ts';
function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value),
  }});
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent() {} } });
}
const payload = { sampleType: 'water', sampleId: 'EC-001', folderId: null, fields: { ph: 7 } };
test('an open offline sheet can be saved after its queue item finishes syncing', () => {
  storage(); const opened = enqueue(payload); setQueue([]);
  cacheCloudSamples([{ id: opened.queuedId, ...payload, updatedAt: '2026-11-11T12:00:00Z' } as any]);
  updateQueuedSample(opened.queuedId, { ...payload, fields: { ph: 6.5 } }, opened);
  const pending = getQueue()[0];
  assert.equal(pending.targetId, opened.queuedId);
  assert.equal(pending.baseUpdatedAt, '2026-11-11T12:00:00Z');
  assert.equal(pending.payload.fields.ph, 6.5);
});
test('stale sample sheet cannot overwrite a newer local edit or deletion', () => {
  storage(); const opened = enqueue(payload);
  updateQueuedSample(opened.queuedId, { ...payload, fields: { ph: 8 } });
  assert.throws(() => updateQueuedSample(opened.queuedId, payload, opened), /changed/);
  assert.equal(getQueue()[0].payload.fields.ph, 8);
  deleteQueuedSample(opened.queuedId);
  assert.throws(() => updateQueuedSample(opened.queuedId, payload, opened), /deleted/);
});
test('if the original queue and cloud ID are unavailable, preserve a new recovery record', () => {
  storage(); const opened = enqueue(payload); setQueue([]);
  updateQueuedSample(opened.queuedId, payload, opened);
  assert.equal(getQueue()[0].targetId, undefined);
  assert.match(getQueue()[0].payload.sampleId, /recovered edit/);
});

test('water samples and cloud cache survive 30 days of repeated storage reopens', async () => {
  storage();
  const { getCachedCloudSamples } = await import('../src/lib/cloud-samples.ts');
  const originalNow = Date.now;
  const start = originalNow();
  try {
    for (let day = 1; day <= 30; day++) {
      Date.now = () => start + day * 86400000;
      enqueue({ ...payload, sampleId: `EC-${day}`, fields: { ph: 0, temperature: 12.5, location: '-0.1234567, -78.1234567', customParams: [{ label: 'Bottle', value: `00${day}` }], media: [{ localKey: `photo-${day}`, kind: 'photo' }] } });
      cacheCloudSamples([{ id: `cloud-${day}`, ...payload, updatedAt: new Date(Date.now()).toISOString() } as any]);
      for (let launch = 0; launch < 4; launch++) {
        // Serialize and reconstruct the backing store, discarding its object identity.
        const saved = Array.from({ length: localStorage.length }, (_, i) => {
          const key = localStorage.key(i)!;
          return [key, localStorage.getItem(key)!] as const;
        });
        storage();
        for (const [key, value] of JSON.parse(JSON.stringify(saved))) localStorage.setItem(key, value);
        const records = getQueue();
        assert.equal(records.length, day);
        assert.equal(getCachedCloudSamples().length, day);
        for (const record of records) {
          assert.equal(record.payload.fields.ph, 0);
          assert.equal(record.payload.fields.location, '-0.1234567, -78.1234567');
          assert.ok(record.payload.fields.media);
        }
      }
    }
  } finally { Date.now = originalNow; }
});
