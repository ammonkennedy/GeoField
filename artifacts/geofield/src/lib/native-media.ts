/** Keep native media outside WebKit's browser-storage quota. Keys carry no user paths. */
export function nativeMediaKey(id: string, mime: string, account: string): string {
  return `native-media:${id}:${encodeURIComponent(mime)}:${encodeURIComponent(account)}`;
}
export function nativeMediaLocation(key: string): { path: string; mime: string } | null {
  const match = /^native-media:([0-9a-f-]{36}):(.+):([^:]+)$/i.exec(key);
  if (!match) return null;
  return { path: `geofield-media/account-${encodeURIComponent(decodeURIComponent(match[3]))}/${match[1]}.bin`, mime: decodeURIComponent(match[2]) };
}
export function mediaDataUrlPayload(dataUrl: string): { mime: string; base64: string; sizeBytes: number } {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match || /[^A-Za-z0-9+/=]/.test(match[2]) || match[2].length % 4 !== 0) {
    throw new Error('The photo or video could not be read. Keep the original and try again.');
  }
  const base64 = match[2];
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return { mime: match[1], base64, sizeBytes: base64.length * 3 / 4 - padding };
}
export function mediaDataUrlBytes(dataUrl: string): { mime: string; bytes: Uint8Array; base64: string } {
  const { mime, base64 } = mediaDataUrlPayload(dataUrl);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return { mime, bytes, base64 };
}
