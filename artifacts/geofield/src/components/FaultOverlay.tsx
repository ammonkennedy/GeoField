import { useEffect, useRef, useState } from 'react';
import { Popup, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';

const SOURCE = 'geofield-active-faults';
const LINE = `${SOURCE}-line`;
const HALO = `${SOURCE}-halo`;
const GEM = 'https://github.com/GEMScienceTools/gem-global-active-faults';
const fields: [string, string][] = [
  ['fz_name', 'Fault zone'], ['slip_type', 'Movement'], ['average_dip', 'Dip (°)'],
  ['dip_dir', 'Dip direction'], ['net_slip_rate', 'Net slip rate (mm/year)'],
  ['last_movement', 'Last movement'], ['catalog_name', 'Regional catalog'],
  ['catalog_id', 'Catalog ID'], ['reference', 'Reference'], ['notes', 'Notes'],
];

export function FaultOverlay({ map, exportMode }: { map: MapLibreMap; exportMode: boolean }) {
  const [message, setMessage] = useState('Loading fault lines…');
  const [retry, setRetry] = useState(0);
  const ignoreClick = useRef(exportMode);
  ignoreClick.current = exportMode;
  useEffect(() => {
    let popup: Popup | undefined;
    const add = () => {
      if (!map.isStyleLoaded() || map.getSource(SOURCE)) return;
      map.addSource(SOURCE, {
        type: 'geojson', data: `${import.meta.env.BASE_URL}data/faults/gem-active-faults.geojson`,
        attribution: `<a href="${GEM}">GEM Foundation · Styron &amp; Pagani (2020)</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>`,
      });
      map.addLayer({ id: HALO, type: 'line', source: SOURCE, paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.8 } });
      map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': '#be123c', 'line-width': 2.5 } });
    };
    const loaded = (e: any) => {
      if (e.sourceId === SOURCE && e.isSourceLoaded) setMessage('Tap a red fault line for details. Global coverage includes U.S. faults but is incomplete; mapped locations are approximate.');
    };
    const error = (e: any) => {
      if (e.sourceId === SOURCE) setMessage('Fault lines could not load. Try again.');
    };
    const click = (e: MapMouseEvent) => {
      if (ignoreClick.current || !map.getLayer(LINE)) return;
      popup?.remove();
      // Inspect only rendered lines within a small touch target, never a remote nearest-fault result.
      const hits = map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: [LINE] });
      const content = document.createElement('div');
      content.style.cssText = 'color:#0f172a;max-height:300px;overflow:auto;padding:4px;font-size:13px';
      const seen = new Set<string>();
      for (const hit of hits) {
        const p = hit.properties;
        const id = String(p.catalog_id || JSON.stringify(p));
        if (seen.has(id)) continue;
        seen.add(id);
        const title = document.createElement('h3'); title.textContent = p.name || p.fz_name || 'Unnamed fault';
        title.style.cssText = 'font-weight:700;color:#be123c;margin:8px 0'; content.append(title);
        for (const [key, label] of fields) {
          if (p[key] == null || String(p[key]).trim() === '') continue;
          const row = document.createElement('p'); row.textContent = `${label}: ${p[key]}`; content.append(row);
        }
      }
      const note = document.createElement('p'); note.style.marginTop = '8px';
      note.textContent = hits.length ? 'Values in parentheses are (preferred, minimum, maximum); blanks mean unavailable. Regional mapping detail varies.' : 'No mapped fault at this point. Tap a red line or zoom in to separate nearby faults. Missing lines do not mean faults are absent.';
      content.append(note);
      const source = document.createElement('a'); source.href = GEM; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'GEM fault database · sources & coverage'; source.style.textDecoration = 'underline'; content.append(source);
      popup = new Popup({ maxWidth: '330px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(map);
    };
    setMessage('Loading fault lines…');
    map.on('sourcedata', loaded); map.on('error', error); map.on('load', add); map.on('style.load', add); map.on('click', click); add();
    return () => {
      popup?.remove();
      map.off('sourcedata', loaded); map.off('error', error); map.off('load', add); map.off('style.load', add); map.off('click', click);
      try {
        for (const id of [LINE, HALO]) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      } catch { /* Map can be destroyed when leaving this page. */ }
    };
  }, [map, retry]);
  return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground" role="status">
    {message} {message.includes('could not') && <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button>}
  </div>;
}
