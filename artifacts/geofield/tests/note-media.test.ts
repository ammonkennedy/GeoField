import test from 'node:test';
import assert from 'node:assert/strict';
import { noteVideoMime, noteMediaMime, noteMediaUploadName, MAX_NOTE_VIDEO_BYTES } from '../src/lib/note-media.ts';

test('video MIME and upload names preserve MP4, iPhone MOV, and WebM formats', () => {
  for (const [name, type, expected] of [['clip.mp4', 'video/mp4', 'video/mp4'], ['clip.MOV', '', 'video/quicktime'], ['clip.webm', 'video/webm', 'video/webm']]) {
    assert.equal(noteVideoMime({ name, type, size: 123 }), expected);
    const media = { id: 'stable-id', fileName: name, kind: 'video' as const, mimeType: expected };
    assert.equal(noteMediaMime(media), expected);
    assert.equal(noteMediaUploadName(media), `stable-id.${name.split('.').pop()!.toLowerCase()}`);
  }
});
test('legacy note photos remain JPEG and videos reject invalid, empty, or oversized files', () => {
  assert.equal(noteMediaMime({ id: 'old', fileName: 'original.png' }), 'image/jpeg');
  assert.equal(noteMediaUploadName({ id: 'old', fileName: 'original.png' }), 'old.jpg');
  assert.throws(() => noteVideoMime({ name: 'fake.mp4', type: 'text/plain', size: 5 }), /video file/);
  assert.throws(() => noteVideoMime({ name: 'empty.mp4', type: 'video/mp4', size: 0 }), /empty/);
  assert.throws(() => noteVideoMime({ name: 'big.mp4', type: 'video/mp4', size: MAX_NOTE_VIDEO_BYTES + 1 }), /50 MB/);
});
