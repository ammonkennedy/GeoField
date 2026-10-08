import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoDirection, withPhotoDirection, directionLabel } from '../src/lib/photo-direction.ts';
import { photoWithOriginal } from '../src/lib/photo-versions.ts';
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
test('camera direction survives storage, edits, and original toggle', () => {
  const d = { degrees: 45, reference: 'magnetic' as const, accuracy: 'low' as const };
  const captured = withPhotoDirection(jpeg, d);
  assert.deepEqual(photoDirection(captured), d);
  const edited = photoWithOriginal(jpeg, captured);
  assert.deepEqual(photoDirection(edited), d);
  assert.deepEqual(photoDirection(photoWithOriginal(jpeg, edited)), d);
  assert.equal(directionLabel(d), 'Facing NE · 045° magnetic · Low compass accuracy');
});
test('missing and invalid direction is never replaced by a zero heading', () => {
  assert.equal(photoDirection(jpeg), null);
  assert.equal(directionLabel(null), 'Direction unavailable');
  assert.equal(photoDirection(withPhotoDirection(jpeg, {degrees: NaN, reference:'true'})), null);
  assert.equal(directionLabel({ degrees: 359.9, reference: 'true' }), 'Facing N · 000° true');
});
function exif(little: boolean, tag = 0x11) {
  const t = Buffer.alloc(80); const u16=(n:number,v:number)=>little?t.writeUInt16LE(v,n):t.writeUInt16BE(v,n); const u32=(n:number,v:number)=>little?t.writeUInt32LE(v,n):t.writeUInt32BE(v,n);
  t.write(little?'II':'MM');u16(2,42);u32(4,8);u16(8,1);u16(10,0x8825);u16(12,4);u32(14,1);u32(18,26);
  u16(26,2);u16(28,0x10);u16(30,2);u32(32,2);t.write('T',36);
  u16(40,tag);u16(42,5);u32(44,1);u32(48,60);u32(60,905);u32(64,10);
  const payload=Buffer.concat([Buffer.from('Exif\0\0'),t]); const header=Buffer.from([255,216,255,225,0,payload.length+2]);
  return 'data:image/jpeg;base64,'+Buffer.concat([header,payload,Buffer.from([255,217])]).toString('base64');
}
test('reads both EXIF byte orders and ignores GPS travel heading', () => {
  for (const little of [true,false]) {
    assert.deepEqual(photoDirection(exif(little)), {degrees:90.5, reference:'true'});
    assert.equal(photoDirection(exif(little,0x0f)), null);
  }
});
