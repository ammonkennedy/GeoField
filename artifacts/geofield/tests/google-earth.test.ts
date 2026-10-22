import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleEarthKml } from '../src/lib/google-earth.ts';
import type { TrackPoint } from '../src/lib/track-math.ts';

const point = { name: 'Site <A> & "B"', description: 'Future sample site\nRock & soil', latitude: 40.5, longitude: -111.2, color: '#f59e0b' };
const gps = (latitude: number, segment: number): TrackPoint => ({ latitude, longitude: -110, segment, timestamp: 1, accuracy: 5, elevation: null, elevationAccuracy: null });

test('KML preserves labels, escapes XML and uses longitude first and KML colors', () => {
  const kml = buildGoogleEarthKml([point], []);
  assert.ok(kml.includes('Site &lt;A&gt; &amp; &quot;B&quot;'));
  assert.ok(kml.includes('Future sample site\nRock &amp; soil'));
  assert.ok(kml.includes('<coordinates>-111.2,40.5</coordinates>'));
  assert.ok(kml.includes('<color>ff0b9ef5</color>'));
  assert.ok(kml.includes('xmlns="http://www.opengis.net/kml/2.2"'));
});

test('recording interruptions remain separate green line geometries', () => {
  const kml = buildGoogleEarthKml([], [{ name: 'Route & creek', points: [gps(40, 0), gps(41, 0), gps(42, 1), gps(43, 1)] }]);
  assert.equal(kml.match(/<LineString>/g)?.length, 2);
  assert.ok(kml.includes('<coordinates>-110,40 -110,41</coordinates>'));
  assert.ok(kml.includes('<coordinates>-110,42 -110,43</coordinates>'));
  assert.ok(kml.includes('<color>ff4aa316</color>'));
});

test('empty selections and corrupt tracks report errors rather than fabricate geometry', () => {
  assert.throws(() => buildGoogleEarthKml([], []), /Select map records/);
  assert.throws(() => buildGoogleEarthKml([{ ...point, latitude: NaN }], []), /Select map records/);
  assert.throws(() => buildGoogleEarthKml([], [{ name: 'bad', points: [gps(40, 0), gps(NaN, 0), gps(42, 0)] }]), /invalid coordinates/);
});

test('single-point tracks remain available and invalid XML controls are removed', () => {
  const kml = buildGoogleEarthKml([], [{ name: 'Start\u0000', points: [gps(40, 0)] }]);
  assert.ok(kml.includes('<name>Start</name>'));
  assert.ok(kml.includes('<coordinates>-110,40</coordinates>'));
});
