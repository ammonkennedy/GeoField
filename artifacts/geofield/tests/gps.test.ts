import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAccuratePosition } from '../src/lib/gps.ts';

function fixture() {
  let success: PositionCallback;
  let failure: PositionErrorCallback;
  const cleared: number[] = [];
  const gps = {
    watchPosition(ok: PositionCallback, fail: PositionErrorCallback, options: PositionOptions) {
      success = ok; failure = fail;
      assert.equal(options.maximumAge, 0);
      assert.equal(options.enableHighAccuracy, true);
      return 42;
    },
    clearWatch(id: number) { cleared.push(id); },
  };
  return { gps, cleared, emit(accuracy: number, timestamp = Date.now(), latitude = 40) {
    success({ timestamp, coords: { latitude, longitude: -110, accuracy, altitude: 1000, altitudeAccuracy: 10 } } as GeolocationPosition);
  }, error(code: number) { failure({ code } as GeolocationPositionError); } };
}

test('keeps the best fresh fix when later readings worsen; cleans up at deadline', async () => {
  const f = fixture(); const pending = getAccuratePosition(f.gps, 30);
  f.emit(30); f.emit(8); f.emit(20);
  assert.equal((await pending).coords.accuracy, 8);
  assert.deepEqual(f.cleared, [42]);
});
test('rejects stale and invalid readings and stops early at five metres', async () => {
  const f = fixture(); const pending = getAccuratePosition(f.gps, 30);
  f.emit(1, Date.now() - 60000); f.emit(-1); f.emit(1, Date.now(), 100);
  f.emit(5);
  assert.equal((await pending).coords.accuracy, 5);
  assert.deepEqual(f.cleared, [42]);
});
test('recovers from a temporary unavailable error', async () => {
  const f = fixture(); const pending = getAccuratePosition(f.gps, 30);
  f.error(2); f.emit(4);
  assert.equal((await pending).coords.accuracy, 4);
});
test('permission denial rejects and clears the watch', async () => {
  const f = fixture(); const pending = getAccuratePosition(f.gps, 30);
  f.error(1);
  await assert.rejects(pending, (error: any) => error.code === 1);
  assert.deepEqual(f.cleared, [42]);
});
test('no usable fix times out without inventing coordinates', async () => {
  const f = fixture(); const pending = getAccuratePosition(f.gps, 20);
  f.emit(1, Date.now() - 60000);
  await assert.rejects(pending, /GPS_TIMEOUT/);
  assert.deepEqual(f.cleared, [42]);
});
