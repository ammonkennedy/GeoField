import { TRACK_MAP_SOURCE, trackIdAtPoint } from '@/lib/track-map';
import { datasetSelected, type DatasetSelection } from '@/lib/dataset-selection';
import type { DatasetIdentity } from '@/lib/dataset-identity';
import { useEffect, useRef } from 'react';
import type { Map } from 'maplibre-gl';
import { loadTracks, TRACKS_UPDATED } from '@/lib/tracks';
import { trackSegments } from '@/lib/track-math';

export function TrackOverlay({ map, selection, identities }: { map: Map; selection: DatasetSelection; identities: DatasetIdentity[] }) {
  const framedMap = useRef<{ map: Map; id: string | null } | null>(null);
  useEffect(() => {
    const sourceId = TRACK_MAP_SOURCE;
    let removed = false;
    const onRemove = () => { removed = true; };
    map.on('remove', onRemove);
    const refresh = () => {
      // Tile downloads can keep isStyleLoaded false even though the style can
      // accept our offline GeoJSON. Do not hide tracks behind network loading.
      if (removed || !map.getStyle()?.layers) return;
      const tracks = loadTracks().filter(t => t.visible && datasetSelected(selection, t.datasetId, identities));
      const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: tracks.flatMap(track =>
        trackSegments(track.points).map(coordinates => ({ type: 'Feature' as const,
          properties: { id: track.id, name: track.name }, geometry: { type: 'LineString' as const, coordinates } }))) };
      for (const track of tracks) {
        for (const [role, point] of [['start', track.points[0]], ['end', track.points.at(-1)]] as const) {
          if (point) data.features.push({ type: 'Feature', properties: { id: track.id, name: track.name, role },
            geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] } });
        }
      }
      const source = map.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined;
      if (source) source.setData(data);
      else map.addSource(sourceId, { type: 'geojson', data });
      if (!map.getLayer(sourceId + '-outline')) map.addLayer({ id: sourceId + '-outline', type: 'line', source: sourceId,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7 } });
      if (!map.getLayer(sourceId)) map.addLayer({ id: sourceId, type: 'line', source: sourceId,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#087df0', 'line-width': 4 } });
      if (!map.getLayer(sourceId + '-ends')) map.addLayer({ id: sourceId + '-ends', type: 'circle', source: sourceId,
        filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
          'circle-color': ['match', ['get', 'role'], 'start', '#16a34a', '#087df0'] } });
    };
    const fit = () => {
      const id = new URLSearchParams(window.location.search).get('track');
      const points = loadTracks().find(t => t.id === id)?.points;
      if (!points?.length || (framedMap.current?.map === map && framedMap.current.id === id)) return;
      framedMap.current = { map, id };
      let west = points[0].longitude, east = west, south = points[0].latitude, north = south;
      for (const p of points) { west = Math.min(west, p.longitude); east = Math.max(east, p.longitude); south = Math.min(south, p.latitude); north = Math.max(north, p.latitude); }
      map.fitBounds([[west, south], [east, north]], { padding: 50, maxZoom: 17, duration: 0 });
    };
    const loaded = () => { refresh(); fit(); };
    refresh();
    if (map.getStyle()?.layers) fit();
    const hover = (event: import('maplibre-gl').MapMouseEvent) => {
      map.getCanvas().style.cursor = trackIdAtPoint(map, event.point) ? 'pointer' : '';
    };
    map.on('mousemove', hover);
    map.on('load', loaded);
    map.on('style.load', refresh);
    window.addEventListener(TRACKS_UPDATED, refresh);
    window.addEventListener('popstate', fit);
    return () => {
      map.off('mousemove', hover);
      if (!removed) map.getCanvas().style.cursor = '';
      map.off('style.load', refresh); map.off('load', loaded); map.off('remove', onRemove); window.removeEventListener(TRACKS_UPDATED, refresh);
      window.removeEventListener('popstate', fit);
      if (removed) return;
      for (const id of [sourceId + '-ends', sourceId, sourceId + '-outline']) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, selection, identities]);
  return null;
}
