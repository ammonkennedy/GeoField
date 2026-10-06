import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
const colors = ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];
export function PhotoEditor({ src, onSave, onCancel, onDirty }: {
  src: string; onSave: (dataUrl: string) => Promise<void>; onCancel: () => void; onDirty: (dirty: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<number | null>(null);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(4);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const redraw = () => {
    const c = canvas.current; const img = image.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('Photo editing is unavailable.');
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const stroke of strokes.current) {
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
  };
  useEffect(() => {
    const img = new Image(); let cancelled = false;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !canvas.current) return;
      const scale = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.current.width = Math.round(img.naturalWidth * scale);
      canvas.current.height = Math.round(img.naturalHeight * scale);
      image.current = img;
      try { redraw(); setReady(true); } catch { setError('Could not open this photo for editing.'); }
    };
    img.onerror = () => { if (!cancelled) setError('Could not load the photo. Sync it to this device and try again.'); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * event.currentTarget.width / bounds.width, y: (event.clientY - bounds.top) * event.currentTarget.height / bounds.height };
  };
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Draw with your finger or mouse. Save edits to replace this photo’s displayed image.</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Drawing colors">{colors.map(c => <button key={c} type="button" disabled={saving} aria-label={`Draw in ${{ '#ef4444': 'red', '#fbbf24': 'yellow', '#22c55e': 'green', '#3b82f6': 'blue', '#a855f7': 'purple', '#ffffff': 'white', '#000000': 'black' }[c]}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`h-10 w-10 rounded-full border-2 ${color === c ? 'ring-2 ring-primary ring-offset-2' : 'border-slate-400'}`} />)}</div>
    <label className="flex items-center gap-3 text-sm">Thickness <input aria-label="Brush thickness" type="range" min="1" max="20" value={width} disabled={saving} onChange={e => setWidth(Number(e.target.value))} />{width}</label>
    <canvas ref={canvas} aria-label="Draw on photo" className="mx-auto block max-h-[45dvh] max-w-full touch-none rounded-lg" style={{ pointerEvents: saving ? 'none' : 'auto' }}
      onPointerDown={event => {
        if (!ready || saving || active.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
        active.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
        strokes.current.push({ color, width: width * event.currentTarget.width / event.currentTarget.getBoundingClientRect().width, points: [point(event)] });
        setCount(strokes.current.length); onDirty(true); redraw();
      }}
      onPointerMove={event => { if (active.current !== event.pointerId) return; strokes.current[strokes.current.length - 1].points.push(point(event)); redraw(); }}
      onPointerUp={() => { active.current = null; }} onPointerCancel={() => { active.current = null; }} onLostPointerCapture={() => { active.current = null; }} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={!count || saving} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); onDirty(strokes.current.length > 0); redraw(); }}>Undo</Button>
      <Button type="button" disabled={!ready || !count || saving} onClick={async () => {
        setSaving(true); setError('');
        try { await onSave(canvas.current!.toDataURL('image/jpeg', 0.95)); onDirty(false); }
        catch (error) { setError(error instanceof Error ? error.message : 'Photo could not be saved. Your drawing is still here.'); }
        finally { setSaving(false); }
      }}>{saving ? 'Saving…' : 'Save edits'}</Button>
      <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}
