export interface TrackPoint {
  latitude: number; longitude: number; timestamp: number; accuracy: number;
  elevation: number | null; elevationAccuracy: number | null;
  /** Start a new segment after an interruption; never draw across missing GPS. */
  segment: number;
}
export function distanceMeters(a: TrackPoint, b: TrackPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function validTrackPoint(p: TrackPoint): boolean {
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 &&
    Number.isFinite(p.timestamp) && Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= 50;
}
export function acceptTrackPoint(points: TrackPoint[], next: TrackPoint): boolean {
  if (!validTrackPoint(next)) return false;
  const previous = points.at(-1);
  if (!previous) return true;
  if (next.timestamp <= previous.timestamp) return false;
  if (next.segment !== previous.segment) return true;
  const seconds = (next.timestamp - previous.timestamp) / 1000;
  const distance = distanceMeters(previous, next);
  // Walking tracks: suppress stationary jitter and implausible jumps.
  return seconds >= 2 && distance >= Math.max(3, Math.min(12, (previous.accuracy + next.accuracy) / 4)) && distance / seconds <= 12;
}
export function trackStats(points: TrackPoint[]) {
  let distance = 0, gain = 0, loss = 0, elevationAnchor: TrackPoint | undefined;
  let seconds = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i], previous = points[i - 1];
    if (previous && point.segment === previous.segment) {
      distance += distanceMeters(previous, point);
      seconds += Math.max(0, (point.timestamp - previous.timestamp) / 1000);
    } else elevationAnchor = undefined;
    if (point.elevation === null || !Number.isFinite(point.elevation) || point.elevationAccuracy === null || !Number.isFinite(point.elevationAccuracy) || point.elevationAccuracy < 0 || point.elevationAccuracy > 20) continue;
    if (!elevationAnchor) { elevationAnchor = point; continue; }
    const delta = point.elevation - elevationAnchor.elevation!;
    // Accumulate only meaningful changes; raw GPS height jitter overstates gain.
    const threshold = Math.max(3, point.elevationAccuracy, elevationAnchor.elevationAccuracy ?? 3);
    if (Math.abs(delta) >= threshold) {
      if (delta > 0) gain += delta; else loss -= delta;
      elevationAnchor = point;
    }
  }
  const heights = points.filter(p => p.elevation !== null && Number.isFinite(p.elevation) && p.elevationAccuracy !== null && Number.isFinite(p.elevationAccuracy) && p.elevationAccuracy >= 0 && p.elevationAccuracy <= 20).map(p => p.elevation!);
  return { distance, gain, loss, seconds, hasElevation: heights.length > 0,
    minimumElevation: heights.length ? heights.reduce((a,b) => Math.min(a,b)) : null,
    maximumElevation: heights.length ? heights.reduce((a,b) => Math.max(a,b)) : null };
}
export function trackSegments(points: TrackPoint[]): number[][][] {
  const segments: number[][][] = [];
  for (let i = 0; i < points.length; i++) {
    if (!i || points[i].segment !== points[i - 1].segment) segments.push([]);
    segments.at(-1)!.push([points[i].longitude, points[i].latitude]);
  }
  return segments.filter(s => s.length >= 2);
}
