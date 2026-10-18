import test from 'node:test';
import assert from 'node:assert/strict';
import { trailGeometryPoints, fetchTrailGeometry } from '../src/lib/saved-trails.ts';
import { trackStats, trackSegments } from '../src/lib/track-math.ts';
import { trackPayload, validateTrackSnapshot } from '../src/lib/track-sync.ts';
test('downloaded geometry retains disconnected segments without artificial mileage or elevation', () => {
  const points = trailGeometryPoints({ type: 'MultiLineString', coordinates: [[[0,0],[0,0.001]], [[30,30],[30,30.001]]] }, 1000);
  assert.equal(trackSegments(points).length, 2);
  assert.ok(trackStats(points).distance > 220 && trackStats(points).distance < 225);
  assert.equal(trackStats(points).hasElevation, false);
  assert.equal(trackStats(points).seconds, 0);
});
test('rejects empty, malformed and projected coordinates before storage', () => {
  for (const coordinates of [[], [[]], [[[0,0]]], [[[0,0],[NaN,2]]], [[[0,0],[400,200]]]]) {
    assert.throws(() => trailGeometryPoints({ type: 'MultiLineString', coordinates }, 1000));
  }
});
test('download source survives cloud payload and validation', () => {
  const track = trackPayload({ id: 'test', name: 'Trail', startedAt: new Date(1000).toISOString(), points: [], downloadedTrail: { source: 'usgs', id: 42 } });
  assert.deepEqual(validateTrackSnapshot({ schema: 1, revision: 'rev', track }).track.downloadedTrail, { source: 'usgs', id: 42 });
  assert.throws(() => validateTrackSnapshot({ schema: 1, revision: 'rev', track: { ...track, downloadedTrail: { source: 'bad', id: 42 } } }));
});
test('USGS download requests full object geometry, not clipped rendered feature', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input)); assert.equal(url.searchParams.get('objectIds'), '42');
    assert.equal(url.searchParams.get('outSR'), '4326'); assert.equal(url.searchParams.has('geometry'), false);
    return Response.json({ features: [{ geometry: { type: 'LineString', coordinates: [[0,0],[1,1]] } }] });
  };
  try { assert.equal((await fetchTrailGeometry({ source: 'usgs', id: 42, name: 'Trail' }, new AbortController().signal)).type, 'LineString'); }
  finally { globalThis.fetch = original; }
});
test('OSM download deduplicates ways and refuses partial timeout responses', async () => {
  const original = globalThis.fetch;
  const way = { type: 'way', id: 1, geometry: [{lon:0,lat:0},{lon:1,lat:1}] };
  try {
    globalThis.fetch = async () => Response.json({ elements: [way, way] });
    const result = await fetchTrailGeometry({source:'osm', id:42, name:'Trail'}, new AbortController().signal);
    assert.equal(result.coordinates.length, 1);
    globalThis.fetch = async () => Response.json({ elements: [way], remark: 'timeout' });
    await assert.rejects(fetchTrailGeometry({source:'osm',id:42,name:'Trail'},new AbortController().signal));
  } finally { globalThis.fetch = original; }
});
