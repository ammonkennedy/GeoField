import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupHikingTrails, trailDistance } from '../src/lib/hiking-trails.ts';

test('route lengths are converted from metres into km and miles', () => {
  assert.equal(trailDistance({ route: { length: 1609.344 } }), '1.6 km (1.0 mi)');
  assert.equal(trailDistance({ official_length: 10000, route: { length: 5000 } }), '10.0 km (6.2 mi)');
  for (const length of [undefined, null, -1, 0, NaN, '10 km']) assert.equal(trailDistance({ official_length: length }), 'Distance unavailable');
});

test('lookup uses the clicked area and fetches the matching route details', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(url.includes('by_area') ? { results: [{ id: 123, type: 'relation', name: 'Test trail' }] } : { route: { length: 2000 } }));
  }) as typeof fetch;
  try {
    assert.deepEqual(await lookupHikingTrails([-105, 39, -104.99, 39.01], new AbortController().signal), [{ id: 123, name: 'Test trail', distance: '2.0 km (1.2 mi)' }]);
    assert.equal(new URL(urls[0]).searchParams.get('bbox'), '-105,39,-104.99,39.01');
    assert.match(urls[1], /details\/relation\/123$/);
  } finally { globalThis.fetch = original; }
});

test('empty coverage is not replaced with a fabricated trail', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{"results":[]}')) as typeof fetch;
  try { assert.deepEqual(await lookupHikingTrails([0, 0, 1, 1], new AbortController().signal), []); }
  finally { globalThis.fetch = original; }
});

test('failed lookup stays an error so the popup can offer retry', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
  try { await assert.rejects(lookupHikingTrails([0, 0, 1, 1], new AbortController().signal), /503/); }
  finally { globalThis.fetch = original; }
});
