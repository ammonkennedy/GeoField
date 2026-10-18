import { readPhotoMetadata, writePhotoMetadata } from './photo-versions.ts';
export type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
export type PhotoEditHistory = { width: number; height: number; strokes: Stroke[]; legacyBase?: string };
const MAGIC = 'GeoFieldDrawingV1:';
export function readEditHistory(src: string): PhotoEditHistory | null {
  const raw = readPhotoMetadata(src, MAGIC);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > 4096 || value.height > 4096 || !Array.isArray(value.strokes) || value.strokes.some((s: Stroke) => !/^#[a-fA-F0-9]{6}$/.test(s.color) || !Number.isFinite(s.width) || s.width <= 0 || !Array.isArray(s.points) || !s.points.length || s.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) || (value.legacyBase !== undefined && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value.legacyBase))) throw new Error('Saved drawing history could not be read. Your photo has not been changed.');
  return value;
}
export function withEditHistory(jpeg: string, history: PhotoEditHistory): string {
  return writePhotoMetadata(jpeg, MAGIC, JSON.stringify(history));
}
