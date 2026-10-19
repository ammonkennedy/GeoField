import test from 'node:test';
import assert from 'node:assert/strict';
import { trackInfoRows, trackIdAtPoint, TRACK_MAP_SOURCE } from '../src/lib/track-map.ts';
import type { TrackData } from '../src/lib/track-sync.ts';
const track: TrackData = { id: 't', name: 'Field route', startedAt: '2026-10-18T12:00:00Z', points: [
  { latitude: 40, longitude: -111, timestamp: 0, segment: 0, accuracy: 5, elevation: null, elevationAccuracy: null },
  { latitude: 40.001, longitude: -111, timestamp: 60000, segment: 0, accuracy: 5, elevation: null, elevationAccuracy: null },
  { latitude: 41, longitude: -111, timestamp: 900000, segment: 1, accuracy: 5, elevation: null, elevationAccuracy: null },
] };
test('saved track information excludes gaps and keeps missing elevation unavailable', () => {
  const rows = Object.fromEntries(trackInfoRows(track));
  assert.equal(rows.Distance, '0.07 mi');
  assert.equal(rows['GPS time'], '1 min');
  assert.equal(rows['Elevation gain'], 'Unavailable');
  assert.equal(rows['Elevation loss'], 'Unavailable');
});
test('downloaded tracks distinguish segments and routes, without inventing GPS time', () => {
  for (const source of ['usgs', 'osm'] as const) {
    const rows = Object.fromEntries(trackInfoRows({ ...track, downloadedTrail: { source, id: 42 } }));
    assert.equal(rows.Type, 'Downloaded track');
    assert.equal(rows['GPS time'], undefined);
    assert.match(rows.Coverage, source === 'usgs' ? /segment.*USGS/ : /route.*OpenStreetMap/);
  }
});
test('track hit testing only queries existing track layers with a touch margin', () => {
  let queried = false;
  const map = { getLayer: (id: string) => id === TRACK_MAP_SOURCE, queryRenderedFeatures: (bounds: unknown, options: unknown) => {
    queried = true; assert.deepEqual(bounds, [[40, 50], [60, 70]]); assert.deepEqual(options, { layers: [TRACK_MAP_SOURCE] });
    return [{ properties: { id: 't' } }];
  } };
  assert.equal(trackIdAtPoint(map as any, { x: 50, y: 60 }), 't');
  assert.equal(queried, true);
  assert.equal(trackIdAtPoint({ getLayer: () => undefined } as any, { x: 0, y: 0 }), null);
});
