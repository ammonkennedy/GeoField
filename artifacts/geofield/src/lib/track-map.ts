import type { Map } from 'maplibre-gl';
import type { TrackData } from './track-sync.ts';
import { trackStats } from './track-math.ts';

export const TRACK_MAP_SOURCE = 'geofield-walking-tracks';
/** A forgiving touch target, restricted to visible saved-track geometry. */
export function trackIdAtPoint(map: Map, point: { x: number; y: number }): string | null {
  const layers = [TRACK_MAP_SOURCE + '-ends', TRACK_MAP_SOURCE, TRACK_MAP_SOURCE + '-outline'].filter(id => map.getLayer(id));
  if (!layers.length) return null;
  const hit = map.queryRenderedFeatures([[point.x - 10, point.y - 10], [point.x + 10, point.y + 10]], { layers })
    .find(feature => typeof feature.properties?.id === 'string');
  return hit?.properties?.id ?? null;
}

export function trackInfoRows(track: TrackData): [string, string][] {
  const stats = trackStats(track.points);
  return [
    ['Type', track.downloadedTrail ? 'Downloaded track' : 'Custom track'],
    ['Distance', `${(stats.distance / 1609.344).toFixed(2)} mi`],
    ['Elevation gain', stats.hasElevation ? `${Math.round(stats.gain * 3.28084)} ft` : 'Unavailable'],
    ['Elevation loss', stats.hasElevation ? `${Math.round(stats.loss * 3.28084)} ft` : 'Unavailable'],
    track.downloadedTrail
      ? ['Coverage', track.downloadedTrail.source === 'usgs' ? 'Trail segment · USGS' : 'Mapped route · © OpenStreetMap contributors']
      : ['GPS time', `${Math.floor(stats.seconds / 60)} min`],
  ];
}

export function trackPopupContent(track: TrackData): HTMLElement {
  const content = document.createElement('section');
  content.setAttribute('aria-label', 'Track information');
  content.style.cssText = 'color:#0f172a;max-height: min(320px, 50dvh);overflow:auto;overflow-wrap:anywhere;padding:4px;font:13px system-ui;';
  const title = document.createElement('strong'); title.textContent = track.name; content.append(title);
  const list = document.createElement('dl'); list.style.margin = '8px 0';
  for (const [label, value] of trackInfoRows(track)) {
    const row = document.createElement('div'); row.style.marginTop = '5px';
    const term = document.createElement('dt'); term.style.display = 'inline'; term.textContent = `${label}: `;
    const detail = document.createElement('dd'); detail.style.cssText = 'display:inline;margin:0;font-weight:600'; detail.textContent = value;
    row.append(term, detail); list.append(row);
  }
  content.append(list);
  const date = document.createElement('p'); date.textContent = `${track.downloadedTrail ? 'Downloaded' : 'Started'} ${new Date(track.startedAt).toLocaleString()}`; content.append(date);
  if (track.downloadedTrail) {
    const note = document.createElement('p'); note.style.cssText = 'margin-top:8px;font-size:11px';
    note.textContent = 'Distance covers saved trail geometry, not a round trip. Basemap tiles are not included in the download.'; content.append(note);
  }
  return content;
}
