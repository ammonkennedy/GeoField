import { useEffect, useRef, useState } from 'react';
import { latLngToUTM, parseCoords, utmToLatLng } from '@/lib/utm';
import { Input } from './ui/input';
import { Label } from './ui/label';

function fromLocation(location: string) {
  const coords = parseCoords(location);
  if (!coords || coords[0] < -80 || coords[0] > 84) return { zone: '', hemisphere: 'N', easting: '', northing: '' };
  const utm = latLngToUTM(...coords);
  return { zone: String(Math.min(60, utm.zone)), hemisphere: utm.hemisphere, easting: String(utm.easting), northing: String(utm.northing) };
}
export function SampleUTMEditor({ location = '', onChange, onEdit }: { location?: string; onChange: (location: string) => void; onEdit: () => void }) {
  const [draft, setDraft] = useState(() => fromLocation(location));
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const emitted = useRef<string | null>(null);
  const zoneInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (location === emitted.current) { emitted.current = null; return; }
    setDraft(fromLocation(location));
    dirty.current = false;
    setError('');
    zoneInput.current?.setCustomValidity('');
  }, [location]);
  const beginEdit = () => { onEdit(); dirty.current = true; zoneInput.current?.setCustomValidity('Finish editing the UTM coordinates before saving.'); };
  const commit = () => {
    if (!dirty.current) return;
    try {
      if (!draft.zone.trim() || !draft.easting.trim() || !draft.northing.trim()) throw new Error('Complete all UTM coordinates before saving.');
      const coords = utmToLatLng(Number(draft.zone), draft.hemisphere as 'N' | 'S', Number(draft.easting), Number(draft.northing));
      const next = `${coords[0].toFixed(7)}, ${coords[1].toFixed(7)}`;
      setError(''); zoneInput.current?.setCustomValidity(''); dirty.current = false;
      if (next !== location) { emitted.current = next; onChange(next); }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid UTM coordinates.';
      setError(message); zoneInput.current?.setCustomValidity(message);
    }
  };
  return <div className="rounded-lg border bg-muted/40 p-3.5 space-y-3">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">UTM Coordinates (WGS84)</p>
    <div className="grid grid-cols-2 gap-3">
      {(['zone', 'easting', 'northing'] as const).map(key => <div key={key} className="space-y-1">
        <Label htmlFor={`utm-${key}`}>{key === 'zone' ? 'Zone (1–60)' : key === 'easting' ? 'Easting (m)' : 'Northing (m)'}</Label>
        <Input id={`utm-${key}`} ref={key === 'zone' ? zoneInput : undefined} inputMode="decimal" value={draft[key]} onChange={e => { beginEdit(); setDraft({ ...draft, [key]: e.target.value }); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />
      </div>)}
      <div className="space-y-1"><Label htmlFor="utm-hemisphere">Hemisphere</Label><select id="utm-hemisphere" className="h-10 w-full rounded-md border bg-card px-3 text-sm" value={draft.hemisphere} onChange={e => { beginEdit(); setDraft({ ...draft, hemisphere: e.target.value }); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}><option value="N">Northern</option><option value="S">Southern</option></select></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
