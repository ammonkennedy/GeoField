import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

/** Retry failed remote tiles when service returns, without rebuilding local pins/layers. */
export function MapConnectivity({ map }: { map: MapLibreMap | null }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const disconnected = () => setOnline(false);
    const connected = () => {
      setOnline(true);
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
  if (online) return null;
  return <p role="status" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">Offline · Local points, saved tracks, and downloaded geology remain available. Background imagery and other online layers may be blank.</p>;
}
