import test from 'node:test';
import assert from 'node:assert/strict';
import { latLngToUTM, utmToLatLng } from '../src/lib/utm.ts';

test('WGS84 UTM central meridian and hemisphere false northing', () => {
  assert.deepEqual(utmToLatLng(17, 'N', 500000, 0), [0, -81]);
  assert.deepEqual(utmToLatLng(17, 'S', 500000, 10000000), [0, -81]);
  const south = utmToLatLng(17, 'S', 500000, 9000000);
  assert.ok(south[0] < 0);
  assert.equal(south[1], -81);
});
test('rounded UTM returns within one metre of GPS in Ecuador and other zones', () => {
  for (const [lat, lng] of [[-0.1807, -78.4678], [-2.17, -79.92], [0.35, -78.12], [40.76, -111.89], [-33.86, 151.2], [60, 6], [-79, 3], [83, 15], [0, 180], [0, -180]]) {
    const u = latLngToUTM(lat, lng);
    const [a, b] = utmToLatLng(u.zone, u.hemisphere, u.easting, u.northing);
    assert.ok(Math.abs(a-lat) * 111320 < 1, `${lat}: latitude error`);
    assert.ok(Math.abs(b-lng) * 111320 * Math.cos(lat*Math.PI/180) < 1, `${lng}: longitude error`);
  }
});
test('invalid zones, numbers, hemispheres and polar coordinates are rejected', () => {
  for (const args of [[0,'N',500000,0],[61,'N',500000,0],[17,'X',500000,0],[17,'N',NaN,0],[17,'S',500000,-1],[17,'N',500000,10000000]]) {
    assert.throws(() => utmToLatLng(args[0] as number, args[1] as 'N', args[2] as number, args[3] as number));
  }
});
