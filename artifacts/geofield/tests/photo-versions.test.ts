import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originalFromPhoto, photoWithOriginal } from '../src/lib/photo-versions.ts';
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
test('unedited photos have no original toggle metadata', () => {
  assert.equal(originalFromPhoto(jpeg), null);
});
test('original survives multi-segment storage and subsequent edits without nesting', () => {
  const original = 'data:image/png;base64,' + Buffer.alloc(180000, 42).toString('base64');
  const edited = photoWithOriginal(jpeg, original);
  assert.equal(originalFromPhoto(edited), original);
  const twice = photoWithOriginal(jpeg, edited);
  assert.equal(originalFromPhoto(twice), original);
  assert.equal(twice.length, edited.length);
  // Model the byte-preserving upload/download used by all media stores.
  const transferred = 'data:image/jpeg;base64,' + Buffer.from(twice.split(',')[1], 'base64').toString('base64');
  assert.equal(originalFromPhoto(transferred), original);
});
test('incomplete metadata does not expose a partial original', () => {
  const edited = photoWithOriginal(jpeg, jpeg);
  const bytes = Buffer.from(edited.split(',')[1], 'base64');
  assert.equal(originalFromPhoto('data:image/jpeg;base64,' + bytes.subarray(0, 25).toString('base64')), null);
});
