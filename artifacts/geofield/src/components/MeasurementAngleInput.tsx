import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { validMeasurementAngle } from '@/lib/measurement-edit';

export function MeasurementAngleInput({ value, label, maximum, exclusive = false, onCommit }: {
  value: string | number | undefined; label: string; maximum: number; exclusive?: boolean; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);
  return <div><Input value={draft} type="text" inputMode="decimal" aria-label={`${label} in degrees`} aria-invalid={error}
    className="h-10 bg-card text-base font-semibold font-mono"
    onFocus={() => setEditing(true)} onChange={event => { setDraft(event.target.value); setError(false); }}
    onBlur={() => {
      const number = validMeasurementAngle(draft, maximum, exclusive);
      if (number === null) { setError(true); setDraft(String(value ?? '')); }
      else {
        if (number !== validMeasurementAngle(String(value ?? ""), maximum, exclusive)) onCommit(number);
        setError(false);
      }
      setEditing(false);
    }} />{error && <p role="alert" className="mt-1 text-xs text-destructive">Enter 0–{exclusive ? 'less than ' : ''}{maximum}°. Previous value kept.</p>}</div>;
}
