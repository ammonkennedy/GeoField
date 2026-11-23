import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { localDateTimeValue } from '@/lib/date-time';

/** Explicit HH:mm entry, independent of the phone's 12-hour picker preference. */
export function DateTime24Input({ value = '', onChange, id, className }: { value?: string; onChange: (value: string) => void; id?: string; className?: string }) {
  const local = localDateTimeValue(value);
  const date = local.slice(0, 10);
  const [time, setTime] = useState(local.slice(11, 16));
  useEffect(() => setTime(local.slice(11, 16)), [local]);
  return <div className="flex flex-wrap gap-2">
    <Input id={id} aria-label="Date" type="date" className={className} value={date} onChange={event => onChange(event.target.value ? `${event.target.value}T${/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '00:00'}` : '')} />
    <Input aria-label="Time (24-hour, HH:mm)" type="text" placeholder="HH:mm" title="24-hour time, for example 14:40" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" required={Boolean(date)} className={className} value={time} onChange={event => {
      const next = event.target.value;
      setTime(next);
      if (date && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next)) onChange(`${date}T${next}`);
    }} />
  </div>;
}
