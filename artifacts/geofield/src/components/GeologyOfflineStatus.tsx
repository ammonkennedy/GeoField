import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { GEOLOGY_CACHE_EVENT, geologyCacheWarning, geologyAreas, type GeologyArea } from '@/lib/geology-tile-cache';
import { downloadGeologyArea } from '@/lib/geology-download';
import { Button } from '@/components/ui/button';

export function GeologyOfflineStatus({ map }: { map: MapLibreMap | null }) {
  const [warning, setWarning] = useState(geologyCacheWarning);
  const [areas, setAreas] = useState<GeologyArea[]>([]);
  const [name, setName] = useState('Field area');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    const update = () => setWarning(geologyCacheWarning());
    window.addEventListener(GEOLOGY_CACHE_EVENT, update);
    void geologyAreas().then(value => { if (mounted) setAreas(value); }).catch(() => {
      if (mounted) setMessage('Offline geology storage is unavailable on this device.');
    });
    return () => { mounted = false; active.current?.abort(); active.current = null; window.removeEventListener(GEOLOGY_CACHE_EVENT, update); };
  }, []);
  async function download() {
    if (!map || active.current) return;
    const controller = new AbortController();
    active.current = controller; setBusy(true); setWarning('');
    const bounds = map.getBounds();
    try {
      await downloadGeologyArea(name, [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], controller.signal,
        (done, total) => { if (active.current === controller) setMessage(`Saving geology: ${done} of ${total} tiles`); });
      if (active.current !== controller) return;
      setAreas(await geologyAreas());
      setMessage('Geology area saved for offline use. Tap colored units for their stored information.');
      void navigator.storage?.persist?.().catch(() => false);
    } catch (error) {
      if (active.current !== controller) return;
      setMessage(controller.signal.aborted ? 'Download stopped. Saved tiles remain available; retry to finish this area.' : `${error instanceof Error ? error.message : 'Download failed.'} Completed tiles are kept for retry.`);
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  return <section className="w-full space-y-2 text-xs text-muted-foreground rounded-lg border border-border bg-card px-3 py-2" aria-label="Offline geology">
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="Offline geology area name" className="w-36 rounded border bg-background p-2" maxLength={80} value={name} onChange={event => setName(event.target.value)} />
      <Button size="sm" disabled={!map || busy} onClick={() => void download()}>Download geology area</Button>
      {busy && <Button size="sm" variant="outline" onClick={() => active.current?.abort()}>Cancel download</Button>}
      {areas.length > 0 && <select aria-label="Saved geology areas" className="min-w-0 max-w-full rounded border bg-background p-2" value="" disabled={!map || busy} onChange={event => {
        const area = areas.find(item => item.id === event.target.value);
        if (!area || !map) return;
        const [w, s, e, n] = area.bounds;
        map.fitBounds([[w, s], [e < w ? e + 360 : e, n]], { padding: 30, maxZoom: 14 });
        setMessage(`${area.name} · saved ${new Date(area.savedAt).toLocaleDateString()}.`);
      }}><option value="" disabled>Open saved geology area</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select>}
    </div>
    <p>Download the visible area before leaving service. Includes geology at overview and detailed zoom levels; closer zoom magnifies the saved detail. Satellite, street, terrain, and extra source lookups are not included.</p>
    <p role="status" aria-live="polite">{message || 'Viewed geology tiles are also saved automatically. Keep downloads on this device; clearing app storage removes them.'}</p>
    {warning && <p role="status">{warning}</p>}
  </section>;
}
