import { Children, isValidElement, type ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '../ui/button';
import { normalizeOrder, moveParameter } from '@/lib/sample-parameter-order';

export interface FieldOrderProps {
  extraFields?: ReactNode;
  order?: string[];
  onOrderChange?: (order: string[]) => void;
}

export function OrderControls({ label, index, count, onMove }: { label: string; index: number; count: number; onMove: (direction: -1 | 1) => void }) {
  return <div className="flex gap-1">
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${label} earlier`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${label} later`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
  </div>;
}

export function OrderedFields({ children, extraFields, order, onOrderChange, className }: FieldOrderProps & { children: ReactNode; className: string }) {
  const fields = [...Children.toArray(children), ...Children.toArray(extraFields)].filter(isValidElement);
  const keys = fields.map(field => String(field.key));
  const ordered = normalizeOrder(keys, order);
  return <div className={className}>{ordered.map((key, index) => {
    const field = fields[keys.indexOf(key)];
    return <div key={key} className="min-w-0 space-y-1">
      {onOrderChange && <OrderControls label={key.replace(/^\.\$/, '')} index={index} count={ordered.length} onMove={direction => onOrderChange(moveParameter(ordered, index, direction))} />}
      {field}
    </div>;
  })}</div>;
}
