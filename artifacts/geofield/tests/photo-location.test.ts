import test from 'node:test';
import assert from 'node:assert/strict';
import { photoLocation, withPhotoLocation } from '../src/lib/photo-location.ts';
import { photoWithOriginal } from '../src/lib/photo-versions.ts';
import { photoDirection, withPhotoDirection } from '../src/lib/photo-direction.ts';
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 217]).toString('base64');
const location = { latitude: 0, longitude: -111.5, accuracy: 5, timestamp: 1780000000000 };
test('coordinates survive byte storage and edits alongside direction', () => {
  const original = withPhotoLocation(withPhotoDirection(jpeg, { degrees: 90, reference: 'magnetic' }), location);
  assert.deepEqual(photoLocation(original), location);
  assert.deepEqual(photoLocation(photoWithOriginal(jpeg, original)), location);
  assert.equal(photoDirection(original)?.degrees, 90);
});
test('missing and invalid coordinates remain unavailable', () => {
  assert.equal(withPhotoLocation(jpeg, null), jpeg);
  assert.equal(photoLocation(jpeg), null);
  assert.equal(photoLocation('broken'), null);
  assert.equal(withPhotoLocation(jpeg, { ...location, latitude: 91 }), jpeg);
  assert.equal(withPhotoLocation(jpeg, { ...location, accuracy: -1 }), jpeg);
});
