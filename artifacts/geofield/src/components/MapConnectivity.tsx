import { TOPOGRAPHIC_MAP } from "@/lib/topographic-map";
import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

/** Retry failed remote tiles when service returns, without rebuilding local pins/layers. */
export function MapConnectivity({ map }: { map: MapLibreMap | null }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [topoVisible, setTopoVisible] = useState(false);
  const [topoError, setTopoError] = useState('');
  useEffect(() => {
    if (!map || !TOPOGRAPHIC_MAP.onlineOnly) return;
    const refresh = () => {
      const visible = Boolean(map.getLayer('topographic-layer')) && map.getLayoutProperty('topographic-layer', 'visibility') === 'visible';
      setTopoVisible(visible);
      if (!visible) setTopoError('');
    };
    const failed = (event: any) => {
      if (event.sourceId !== 'topographic') return;
      setTopoError(event.error?.status === 429
        ? 'World Topo has reached its free service limit. Choose another map or try again later.'
        : 'World Topo is unavailable. Check your connection or choose another map.');
    };
    map.on('styledata', refresh);
    map.on('error', failed);
    refresh();
    return () => { map.off('styledata', refresh); map.off('error', failed); };
  }, [map]);
  useEffect(() => {
    const disconnected = () => setOnline(false);
    const connected = () => {
      setOnline(true);
      setTopoError('');
      if (!map) return;
      for (const [id, spec] of Object.entries(map.getStyle()?.sources ?? {})) {
        if (!('tiles' in spec) || !spec.tiles) continue;
        const source = map.getSource(id) as { setTiles?: (tiles: string[]) => unknown } | undefined;
        source?.setTiles?.(spec.tiles);
      }
    };
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); };
  }, [map]);
  if (online) return topoVisible ? <p role="status" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">{topoError || 'World Topo · Online only'}</p> : null;
  return <p role="status" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">Offline · Local points, saved tracks, and downloaded geology remain available. Background imagery and other online layers may be blank.</p>;
}
