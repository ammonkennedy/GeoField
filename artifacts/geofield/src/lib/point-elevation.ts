/** Terrarium RGB encodes metres, including elevations below sea level. */
export function decodeTerrainHeight(red: number, green: number, blue: number) {
  return Math.round((red * 256 + green + blue / 256 - 32768) * 10) / 10;
}
export function terrainPixel(latitude: number, longitude: number) {
  const zoom = 12, count = 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  const x = Math.min(count - Number.EPSILON * count, Math.max(0, (longitude + 180) / 360 * count));
  const y = Math.min(count - Number.EPSILON * count, Math.max(0, (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * count));
  return { url: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${Math.floor(x)}/${Math.floor(y)}.png`, x: Math.floor((x % 1) * 256), y: Math.floor((y % 1) * 256) };
}
/** Cache public terrain tiles for later offline selections; never turn a failed lookup into zero. */
export async function lookupPointElevation(latitude: number, longitude: number, signal: AbortSignal): Promise<number | null> {
  try {
    const pixel = terrainPixel(latitude, longitude);
    const cache = typeof caches === 'undefined' ? null : await caches.open('geofield-point-terrain-v1').catch(() => null);
    let response = await cache?.match(pixel.url);
    if (!response) {
      response = await fetch(pixel.url, { signal });
      if (!response.ok) return null;
      await cache?.put(pixel.url, response.clone()).catch(() => {});
    }
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, 256, 256);
      const [r, g, b, alpha] = context.getImageData(pixel.x, pixel.y, 1, 1).data;
      return alpha === 255 ? decodeTerrainHeight(r, g, b) : null;
    } finally { bitmap.close(); }
  } catch { return null; }
}
