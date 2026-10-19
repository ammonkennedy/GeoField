import { originalFromPhoto, readPhotoMetadata, writePhotoMetadata } from './photo-versions.ts';
export interface PhotoLocation { latitude: number; longitude: number; accuracy: number; timestamp: number }
const MAGIC = 'GeoFieldLocationV1:';
function valid(value: any): value is PhotoLocation {
  return value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 &&
    Number.isFinite(value.accuracy) && value.accuracy >= 0 && Number.isFinite(value.timestamp);
}
export function photoLocation(jpeg: string, nested = false): PhotoLocation | null {
  try {
    const raw = readPhotoMetadata(jpeg, MAGIC);
    if (raw) { const value = JSON.parse(raw); if (valid(value)) return value; }
    const original = !nested && originalFromPhoto(jpeg);
    return original ? photoLocation(original, true) : null;
  } catch { return null; }
}
export function withPhotoLocation(jpeg: string, location: PhotoLocation | null): string {
  return location && valid(location) ? writePhotoMetadata(jpeg, MAGIC, JSON.stringify(location)) : jpeg;
}
/** File-input cameras expose no shutter event. Record a fresh fix on return. */
export function capturePhotoLocation(): Promise<PhotoLocation | null> {
  return new Promise(resolve => {
    if (!globalThis.navigator?.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(position => resolve({
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy, timestamp: position.timestamp,
    }), () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
  });
}
