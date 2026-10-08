import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };
const limit = (value: number, max: number) => Math.max(-max, Math.min(max, value));

/** The original image is unchanged; zoom affects only its presentation. */
export function ZoomablePhoto({ src, alt, caption, fullScreen = false }: { src: string; alt: string; caption?: ReactNode; fullScreen?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const [view, setView] = useState(transform.current);
  const update = (scale: number, x: number, y: number) => {
    scale = Math.max(1, Math.min(6, scale));
    const bounds = viewport.current?.getBoundingClientRect();
    transform.current = { scale, x: limit(x, (bounds?.width || 0) * (scale - 1) / 2), y: limit(y, (bounds?.height || 0) * (scale - 1) / 2) };
    setView(transform.current);
  };
  const zoom = (factor: number) => {
    const current = transform.current;
    update(current.scale * factor, current.x * factor, current.y * factor);
  };
  return <div className={fullScreen ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
    <div className={fullScreen ? "relative min-h-0 flex-1" : "relative"}>
    <div ref={viewport} className={`relative flex ${fullScreen ? "h-full" : "h-[50dvh]"} w-full touch-none select-none items-center justify-center overflow-hidden rounded-lg bg-black/90`}
      style={{ cursor: view.scale > 1 ? 'grab' : 'zoom-in' }}
      onDoubleClick={() => view.scale > 1 ? update(1, 0, 0) : zoom(2)}
      onPointerDown={event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }}
      onPointerMove={event => {
        const before = pointers.current.get(event.pointerId);
        if (!before) return;
        const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
        const after = { x: event.clientX, y: event.clientY };
        const current = transform.current;
        if (other) {
          const previousDistance = Math.hypot(before.x - other.x, before.y - other.y);
          const nextDistance = Math.hypot(after.x - other.x, after.y - other.y);
          if (previousDistance > 0) {
            const scale = Math.max(1, Math.min(6, current.scale * nextDistance / previousDistance));
            const ratio = scale / current.scale;
            const bounds = event.currentTarget.getBoundingClientRect();
            const centerX = bounds.left + bounds.width / 2;
            const centerY = bounds.top + bounds.height / 2;
            update(scale,
              (after.x + other.x) / 2 - centerX - ((before.x + other.x) / 2 - centerX - current.x) * ratio,
              (after.y + other.y) / 2 - centerY - ((before.y + other.y) / 2 - centerY - current.y) * ratio);
          }
        } else update(current.scale, current.x + after.x - before.x, current.y + after.y - before.y);
        pointers.current.set(event.pointerId, after);
      }}
      onPointerUp={event => pointers.current.delete(event.pointerId)}
      onPointerCancel={event => pointers.current.delete(event.pointerId)}
      onLostPointerCapture={event => pointers.current.delete(event.pointerId)}>
      <img src={src} alt={alt} draggable={false} className="pointer-events-none h-full w-full object-contain" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
    </div>
    {caption}
    </div>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button type="button" variant="outline" size="sm" aria-label="Zoom out of photo" disabled={view.scale <= 1} onClick={() => zoom(1 / 1.5)}>−</Button>
      <span className="min-w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(view.scale * 100)}%</span>
      <Button type="button" variant="outline" size="sm" aria-label="Zoom into photo" disabled={view.scale >= 6} onClick={() => zoom(1.5)}>+</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => update(1, 0, 0)}>Reset zoom</Button>
    </div>
    {!fullScreen && <p className="text-center text-xs text-muted-foreground">Pinch to zoom. Drag to move around the enlarged photo.</p>}
  </div>;
}
