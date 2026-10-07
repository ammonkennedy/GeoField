/** Original image carried in private JPEG APP15 segments. Standard image readers
 * display the edited JPEG; our byte-preserving media sync keeps both atomically.
 * Never re-encode this file during sync: that would discard its original.
 */
const MAGIC = 'GeoFieldOriginalV1:';
const CHUNK = 60000;
function decode(url: string): Uint8Array {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(url)) throw new Error('Unsupported photo format.');
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0));
}
function encode(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/jpeg;base64,${btoa(text)}`;
}
export function originalFromPhoto(url: string): string | null {
  const bytes = decode(url);
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  const chunks: string[] = []; let total = 0;
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    if (marker === 218 || marker === 217) break;
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if (marker === 239) {
      const text = new TextDecoder().decode(bytes.subarray(offset + 4, offset + length + 2));
      if (text.startsWith(MAGIC)) {
        const match = text.slice(MAGIC.length).match(/^(\d+)\/(\d+):([\s\S]*)$/);
        if (!match) return null;
        const index = Number(match[1]); const count = Number(match[2]);
        if (count < 1 || count > 1000 || index >= count || (total && total !== count) || chunks[index] !== undefined) return null;
        total = count; chunks[index] = match[3];
      }
    }
    offset += length + 2;
  }
  if (!total || chunks.filter(c => c !== undefined).length !== total) return null;
  const original = chunks.join('');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(original)) return null;
  return original;
}
export function photoWithOriginal(edited: string, original: string): string {
  const jpeg = decode(edited);
  if (jpeg[0] !== 255 || jpeg[1] !== 216) throw new Error('Edited photo must be JPEG.');
  // Preserve the first original across any number of saved edits, without nesting.
  const first = originalFromPhoto(original) || original;
  const count = Math.ceil(first.length / CHUNK);
  if (count > 1000) throw new Error('This photo is too large to preserve its original.');
  const segments = Array.from({ length: count }, (_, i) => {
    const payload = new TextEncoder().encode(`${MAGIC}${i}/${count}:${first.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    const size = payload.length + 2;
    const segment = new Uint8Array(payload.length + 4);
    segment.set([255, 239, size >> 8, size & 255]); segment.set(payload, 4); return segment;
  });
  const result = new Uint8Array(jpeg.length + segments.reduce((sum, s) => sum + s.length, 0));
  result.set(jpeg.subarray(0, 2)); let offset = 2;
  for (const segment of segments) { result.set(segment, offset); offset += segment.length; }
  result.set(jpeg.subarray(2), offset);
  return encode(result);
}
export async function readPhotoBytes(src: string, signal?: AbortSignal): Promise<string> {
  if (src.startsWith('data:')) return src;
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error('Could not load the original photo. Please sync and try again.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
