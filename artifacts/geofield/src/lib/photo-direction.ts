import { originalFromPhoto } from './photo-versions.ts';
export interface PhotoDirection { degrees: number; reference: 'magnetic' | 'true'; accuracy?: 'low' | 'medium' | 'high'; }
const MAGIC = 'GeoFieldDirectionV1:';
function valid(value: any): value is PhotoDirection {
  return value && Number.isFinite(value.degrees) && value.degrees >= 0 && value.degrees < 360 && ['magnetic', 'true'].includes(value.reference);
}
function bytes(url: string) { return Uint8Array.from(atob(url.split(',')[1] || ''), c => c.charCodeAt(0)); }
function url(data: Uint8Array) {
  let binary = ''; for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return 'data:image/jpeg;base64,' + btoa(binary);
}
/** Read GPSImgDirection, not GPSTrack (the photographer's travel direction). */
function exifDirection(data: Uint8Array): PhotoDirection | null {
  try {
    if (new TextDecoder().decode(data.subarray(0, 6)) !== 'Exif\0\0') return null;
    const v = new DataView(data.buffer, data.byteOffset + 6, data.length - 6);
    const little = v.getUint16(0) === 0x4949;
    if (!little && v.getUint16(0) !== 0x4d4d) return null;
    const u16 = (n: number) => v.getUint16(n, little), u32 = (n: number) => v.getUint32(n, little);
    if (u16(2) !== 42) return null;
    const find = (offset: number, tag: number) => {
      const count = u16(offset); if (count > 1000) return null;
      for (let i = 0; i < count; i++) { const p = offset + 2 + i * 12; if (u16(p) === tag) return p; }
      return null;
    };
    const pointer = find(u32(4), 0x8825); if (pointer === null || u16(pointer + 2) !== 4) return null;
    const gps = u32(pointer + 8), direction = find(gps, 0x11), reference = find(gps, 0x10);
    if (direction === null || reference === null || u16(direction + 2) !== 5 || u32(direction + 4) !== 1 || u16(reference + 2) !== 2 || u32(reference + 4) !== 2) return null;
    const r = String.fromCharCode(v.getUint8(reference + 8)); if (r !== 'M' && r !== 'T') return null;
    const p = u32(direction + 8); const degrees = u32(p) / u32(p + 4);
    const result = { degrees, reference: r === 'M' ? 'magnetic' : 'true' };
    return valid(result) ? result : null;
  } catch { return null; }
}
export function photoDirection(dataUrl: string, nested = false): PhotoDirection | null {
  try {
    const data = bytes(dataUrl); if (data[0] !== 255 || data[1] !== 216) return null;
    for (let p = 2; p + 4 <= data.length;) {
      if (data[p] !== 255 || data[p + 1] === 218 || data[p + 1] === 217) break;
      const size = data[p + 2] * 256 + data[p + 3]; if (size < 2 || p + size + 2 > data.length) break;
      const payload = data.subarray(p + 4, p + size + 2);
      if (data[p + 1] === 239) {
        const text = new TextDecoder().decode(payload);
        if (text.startsWith(MAGIC)) { const d = JSON.parse(text.slice(MAGIC.length)); if (valid(d)) return d; }
      }
      if (data[p + 1] === 225) { const d = exifDirection(payload); if (d) return d; }
      p += size + 2;
    }
    const original = !nested && originalFromPhoto(dataUrl);
    return original ? photoDirection(original, true) : null;
  } catch { return null; }
}
export function withPhotoDirection(jpeg: string, direction: PhotoDirection | null): string {
  if (!direction || !valid(direction)) return jpeg;
  const data = bytes(jpeg); if (data[0] !== 255 || data[1] !== 216) return jpeg;
  const payload = new TextEncoder().encode(MAGIC + JSON.stringify(direction));
  const size = payload.length + 2, result = new Uint8Array(data.length + payload.length + 4);
  result.set([255, 216, 255, 239, size >> 8, size & 255]); result.set(payload, 6); result.set(data.subarray(2), payload.length + 6);
  return url(result);
}
export async function preservePhotoDirection(jpeg: string, file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return withPhotoDirection(jpeg, photoDirection(url(buffer)));
}
export function directionLabel(direction: PhotoDirection | null): string {
  if (!direction) return 'Direction unavailable';
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(direction.degrees / 45) % 8];
  return `Facing ${cardinal} · ${String(Math.round(direction.degrees) % 360).padStart(3, '0')}° ${direction.reference}${direction.accuracy === 'low' ? ' · Low compass accuracy' : ''}`;
}
