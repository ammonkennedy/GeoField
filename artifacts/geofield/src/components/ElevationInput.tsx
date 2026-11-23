import { Input } from './ui/input';
import { formatElevation } from '@/lib/elevation';

export function ElevationInput({ value, accuracy, onChange }: { value?: number | null; accuracy?: number | null; onChange: (value: number | null) => void }) {
  return <div className="space-y-1">
    <Input type="number" step="any" aria-label="Elevation in metres" placeholder="Elevation (m)" value={typeof value === 'number' && Number.isFinite(value) ? value : ''} onChange={event => {
      if (event.target.validity.badInput) return;
      const next = event.target.value === '' ? null : Number(event.target.value);
      if (next === null || Number.isFinite(next)) onChange(next);
    }} />
    <p className="text-xs text-muted-foreground">{value == null ? 'Not available — enter manually or capture GPS.' : formatElevation(value, accuracy)}</p>
  </div>;
}
