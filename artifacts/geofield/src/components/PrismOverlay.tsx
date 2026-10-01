import { useEffect, useRef, useState } from 'react';
import { Popup, type Map as MapLibreMap } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import { loadPrism, prismRegions, type PrismRegion } from '@/lib/prism-storage';
import { cropPrism, prismBounds, prismCsv, prismIndex, prismValue, PRISM_LABELS, PRISM_VARIABLES, type PrismData, type PrismVariable } from '@/lib/prism';
import { prismImage, PRISM_COLORS, TEMP_COLORS } from '@/lib/prism-render';
import { saveFile } from '@/lib/save-file';

export function PrismOverlay({ map, exportMode }: { map: MapLibreMap; exportMode: boolean }) {
  const [data, setData] = useState<PrismData | null>(null);
  const [variable, setVariable] = useState<PrismVariable>('ppt');
  const [regions, setRegions] = useState<PrismRegion[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading PRISM climate averages…');
  const [name, setName] = useState('Field area');
  const [retry, setRetry] = useState(0);
  const popup = useRef<Popup | null>(null);
  const ignoreClick = useRef(exportMode);
  ignoreClick.current = exportMode;
  useEffect(() => {
    let cancelled = false;
    async function init() {
      let saved: PrismRegion[] = [];
      try { saved = await prismRegions('list'); if (!cancelled) setRegions(saved); }
      catch { if (!cancelled) setMessage('Offline storage is unavailable. You can still view and export climate data.'); }
      if (cancelled) return;
      if (saved.length) {
        setData(saved[0].data); setSelectedRegion(saved[0].id);
        const [w, s, e, n] = prismBounds(saved[0].data.grid);
        map.fitBounds([[w, s], [e, n]], { padding: 35, duration: 0 });
        setMessage('Downloaded region ready. Basemap imagery requires its own connection.'); return;
      }
      try { const full = await loadPrism(); if (!cancelled) { setData(full); setMessage('Tap the colored grid to inspect a climate cell.'); } }
      catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Climate data unavailable.'); }
    }
    void init();
    return () => { cancelled = true; };
  }, [retry, map]);

  useEffect(() => {
    if (!data) return;
    let image: ReturnType<typeof prismImage>;
    try { image = prismImage(data, variable); }
    catch (error) { setMessage(String(error)); return; }
    const add = () => {
      if (!map.isStyleLoaded()) return;
      if (map.getLayer('prism-climate')) map.removeLayer('prism-climate');
      if (map.getSource('prism-climate')) map.removeSource('prism-climate');
      map.addSource('prism-climate', { type: 'image', ...image });
      map.addLayer({ id: 'prism-climate', type: 'raster', source: 'prism-climate', paint: { 'raster-opacity': 0.65, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } });
    };
    const click = (event: any) => {
      if (ignoreClick.current) return;
      popup.current?.remove();
      if (map.getLayer('prism-selected')) map.removeLayer('prism-selected');
      if (map.getSource('prism-selected')) map.removeSource('prism-selected');
      const lng = ((event.lngLat.lng + 180) % 360 + 360) % 360 - 180;
      const index = prismIndex(data.grid, lng, event.lngLat.lat);
      const content = document.createElement('div');
      content.style.cssText = 'color:#0f172a;max-height:320px;overflow:auto;padding:4px;font-size:13px;';
      const title = document.createElement('strong'); title.textContent = 'PRISM · 1991–2020 averages'; content.append(title);
      if (index === null || PRISM_VARIABLES.every(v => prismValue(data, v, index) === null)) {
        const p = document.createElement('p'); p.textContent = 'No climate data at this location in the loaded layer. Coverage is the contiguous U.S.; downloaded regions cover only their saved area.'; content.append(p);
      } else {
        const g = data.grid;
        const w = g.west + (index % g.width) * g.step;
        const n = g.north - Math.floor(index / g.width) * g.step;
        map.addSource('prism-selected', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w,n],[w+g.step,n],[w+g.step,n-g.step],[w,n-g.step],[w,n]]] } } });
        map.addLayer({ id: 'prism-selected', type: 'line', source: 'prism-selected', paint: { 'line-color': '#172554', 'line-width': 2 } });
        for (const v of PRISM_VARIABLES) {
          const value = prismValue(data, v, index);
          const p = document.createElement('p'); p.style.marginTop = '6px';
          p.textContent = `${PRISM_LABELS[v]}: ${value === null ? 'No data' : v === 'ppt' ? `${value.toFixed(1)} mm (${(value / 25.4).toFixed(1)} in)` : `${value.toFixed(1)} °C (${(value * 9 / 5 + 32).toFixed(1)} °F)`}`; content.append(p);
        }
        const note = document.createElement('p'); note.style.marginTop = '8px'; note.textContent = 'Modeled ~4 km cell. Temperature minimum/maximum are averages of daily lows/highs, not record extremes. These are climate normals, not current weather.'; content.append(note);
      }
      const source = document.createElement('p'); source.style.marginTop = '8px'; source.textContent = `PRISM Group, Oregon State University · https://prism.oregonstate.edu · accessed ${data.accessed}`; content.append(source);
      popup.current = new Popup({ maxWidth: '330px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
    };
    const attributionElement = document.createElement('div');
    attributionElement.className = 'maplibregl-ctrl maplibregl-ctrl-attrib';
    attributionElement.style.maxWidth = 'min(420px, 75vw)';
    attributionElement.textContent = `PRISM Group, Oregon State University · https://prism.oregonstate.edu · accessed ${data.accessed} · 1991–2020, 4 km`;
    const attribution = { onAdd: () => attributionElement, onRemove: () => attributionElement.remove() };
    map.addControl(attribution, 'bottom-right');
    add(); map.on('load', add); map.on('style.load', add); map.on('click', click);
    return () => {
      popup.current?.remove();
      if (map.hasControl(attribution)) map.removeControl(attribution);
      map.off('load', add); map.off('style.load', add); map.off('click', click);
      try {
        if (map.getLayer('prism-selected')) map.removeLayer('prism-selected');
        if (map.getSource('prism-selected')) map.removeSource('prism-selected');
        if (map.getLayer('prism-climate')) map.removeLayer('prism-climate'); if (map.getSource('prism-climate')) map.removeSource('prism-climate'); } catch { /* Map may already be destroyed on navigation. */ }
    };
  }, [map, data, variable]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation failed. Please try again.'); }
    finally { setBusy(false); }
  }
  function visibleRegion() {
    if (!data) throw new Error('Wait for climate data to load.');
    const b = map.getBounds();
    return cropPrism(data, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }
  return <section className="w-full rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm space-y-2" aria-label="PRISM climate overlay">
    <div className="flex flex-wrap items-center gap-2">
      <strong>PRISM climate · 1991–2020</strong>
      <select aria-label="Climate variable" className="rounded border bg-background p-1.5" value={variable} onChange={e => setVariable(e.target.value as PrismVariable)}>
        {PRISM_VARIABLES.map(v => <option key={v} value={v}>{PRISM_LABELS[v]}</option>)}
      </select>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { setData(await loadPrism()); setSelectedRegion(''); setMessage('Full contiguous U.S. layer loaded.'); })}>Load full U.S. layer</Button>
    </div>
    <p className="text-xs">Annual climate averages · approximately 4 km cells · contiguous United States. Tap a cell for precipitation and temperatures.</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Climate legend">
      {(variable === 'ppt' ? ['<250', '250–500', '500–1,000', '1,000–2,000', '≥2,000 mm/year'] : ['<0', '0–10', '10–20', '20–30', '≥30 °C']).map((label, i) => <span key={label} className="flex items-center gap-1"><span className="inline-block h-3 w-4 border border-black/20" style={{ background: (variable === 'ppt' ? PRISM_COLORS : TEMP_COLORS)[i] }} />{label}</span>)}
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <input aria-label="Climate region name" className="rounded border bg-background p-1.5 w-36" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
      <Button size="sm" disabled={!data || busy} onClick={() => void run(async () => {
        const region = { id: crypto.randomUUID(), name: name.trim() || 'Field area', savedAt: new Date().toISOString(), data: visibleRegion() };
        await prismRegions('put', region); setRegions(await prismRegions('list')); setMessage('Visible climate region saved on this device for offline use.');
      })}>Download visible region</Button>
      <Button size="sm" variant="outline" disabled={!data || busy} onClick={() => void run(async () => {
        await saveFile(new Blob([prismCsv(visibleRegion())], { type: 'text/csv;charset=utf-8' }), 'GeoField-PRISM-1991-2020.csv'); setMessage('Climate CSV exported with coordinates, units, and source details.');
      })}>Export visible region CSV</Button>
    </div>
    {regions.length > 0 && <div className="flex flex-wrap gap-2 items-center">
      <select aria-label="Downloaded climate regions" className="max-w-full rounded border bg-background p-1.5" value={selectedRegion} disabled={busy} onChange={e => {
        const region = regions.find(r => r.id === e.target.value); if (!region) return;
        setSelectedRegion(region.id); setData(region.data);
        const [w,s,east,n] = prismBounds(region.data.grid); map.fitBounds([[w,s],[east,n]], { padding: 35 });
        setMessage('Downloaded climate region loaded. Basemap imagery is not included.');
      }}><option value="" disabled>Open a downloaded region</option>{regions.map(r => <option key={r.id} value={r.id}>{r.name} · {r.savedAt.slice(0,10)}</option>)}</select>
      <Button size="sm" variant="outline" disabled={busy || !selectedRegion} onClick={() => void run(async () => {
        await prismRegions('delete', selectedRegion); setRegions(await prismRegions('list')); setSelectedRegion(''); setMessage('Offline download removed. The currently displayed layer remains until you leave this view.');
      })}>Remove download</Button>
    </div>}
    <p className="text-xs" role="status">{busy ? 'Working…' : message}</p>
    {!data && <Button size="sm" variant="outline" onClick={() => setRetry(n => n + 1)}>Retry climate data</Button>}
    <p className="text-xs text-muted-foreground">Downloads save climate cells on this device, not basemap imagery. Browser storage can be cleared. Source: <a className="underline" href="https://prism.oregonstate.edu" target="_blank" rel="noreferrer">PRISM Group, Oregon State University</a>{data ? ` · accessed ${data.accessed}` : ''}.</p>
  </section>;
}
