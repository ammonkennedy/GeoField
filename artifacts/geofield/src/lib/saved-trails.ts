import type { TrackPoint } from './track-math.ts';
import { TRAIL_SERVICE } from './detailed-trails.ts';
export interface TrailDownload { source: 'usgs' | 'osm'; id: number; name: string; }
/** Keep disconnected pieces separate: never invent a connecting trail. */
export function trailGeometryPoints(geometry: any, timestamp: number): TrackPoint[] {
  const lines = geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : [];
  if (!Array.isArray(lines) || !lines.length) throw new Error('No downloadable trail geometry was supplied.');
  const points: TrackPoint[] = [];
  for (const [segment, line] of lines.entries()) {
    if (!Array.isArray(line) || line.length < 2) throw new Error('Trail geometry is incomplete.');
    for (const c of line) {
      if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) throw new Error('Invalid trail coordinates.');
      points.push({ longitude: c[0], latitude: c[1], timestamp, accuracy: 0, elevation: null, elevationAccuracy: null, segment });
      if (points.length > 100000) throw new Error('This route is too large to download. Choose a smaller trail.');
    }
  }
  return points;
}
export async function fetchTrailGeometry(trail: TrailDownload, signal: AbortSignal) {
  if (!Number.isSafeInteger(trail.id) || trail.id <= 0) throw new Error('This trail has no valid download identifier.');
  if (trail.source === 'usgs') {
    const params = new URLSearchParams({ f: 'geojson', objectIds: String(trail.id), outSR: '4326', returnGeometry: 'true', outFields: 'objectid' });
    const response = await fetch(`${TRAIL_SERVICE}/query?${params}`, { signal });
    if (!response.ok) throw new Error('Trail download failed. Please retry when connected.');
    const data = await response.json();
    if (data.error || data.features?.length !== 1) throw new Error('The selected trail segment is no longer available.');
    return data.features[0].geometry;
  }
  // Recursively include child routes and deduplicate ways. Fetch full geometry,
  // not rendered tile fragments or a bounding-box-clipped approximation.
  const query = `[out:json][timeout:45];relation(${trail.id});(._;>>;);way._;out geom;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }), signal });
  if (!response.ok) throw new Error('Trail download failed. Please retry when connected.');
  const data = await response.json();
  if (data.remark || !Array.isArray(data.elements)) throw new Error('The trail service could not return the complete route. Please retry.');
  const ways = new Map<number, any>();
  for (const way of data.elements) if (way.type === 'way') ways.set(way.id, way);
  return { type: 'MultiLineString', coordinates: [...ways.values()].map(way => way.geometry?.map((p: any) => [p.lon, p.lat])) };
}
