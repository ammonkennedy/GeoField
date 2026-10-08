import { photoDirection, directionLabel, type PhotoDirection } from "@/lib/photo-direction";
import { originalFromPhoto, photoWithOriginal, readPhotoBytes } from "@/lib/photo-versions";
import { PhotoEditor } from "@/components/PhotoEditor";
import { ZoomablePhoto } from "@/components/ZoomablePhoto";
import { useState, useRef, useEffect } from 'react';
import { SavePhotoButton } from '@/components/SavePhotoButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function LabeledPhoto({ src, alt, caption = '', onSave, onEdit, className = 'h-40 w-full object-cover', saveMessage = 'Label saved.', initiallyOpen = false, initiallyRead = false, showPreview = true }: {
  src: string; alt: string; caption?: string;
  onEdit?: (dataUrl: string) => Promise<void>;
  onSave?: (label: string) => void | Promise<void>;
  className?: string; saveMessage?: string; initiallyOpen?: boolean; initiallyRead?: boolean; showPreview?: boolean;
}) {
  const editTarget = useRef<{ src: string; save: (dataUrl: string) => Promise<void> } | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<'photo' | 'edit' | 'read' | 'draw'>(initiallyRead ? 'read' : 'photo');
  const [direction, setDirection] = useState<PhotoDirection | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    setOriginal(null); setDirection(null); setShowOriginal(false);
    if (!open) return;
    const controller = new AbortController();
    void readPhotoBytes(src, controller.signal).then(bytes => {
      if (!controller.signal.aborted) { setOriginal(originalFromPhoto(bytes)); setDirection(photoDirection(bytes)); }
    }).catch(() => {});
    return () => controller.abort();
  }, [src, open]);
  const displayedSrc = showOriginal && original ? original : src;
  const [drawingDirty, setDrawingDirty] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const show = (next: 'photo' | 'read') => { setMode(next); setMessage(''); setError(''); setOpen(true); };
  const close = (value: boolean) => {
    if (saving) return;
    if (!value && fullScreen) { setFullScreen(false); return; }
    if (!value && mode === 'edit' && draft !== caption && !confirm('Discard the unsaved photo label?')) return;
    if (!value && mode === "draw" && drawingDirty && !confirm("Discard your unsaved drawing?")) return;
    setOpen(value);
  };
  const preview = (inViewer: boolean) => caption ? <button type="button" aria-label="Read full photo label" className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/70 px-2 py-1 text-left text-xs leading-4 text-white" onClick={() => inViewer ? setMode('read') : show('read')}><span className="line-clamp-2 break-words">{caption}</span></button> : null;
  return <>
    <div className="relative overflow-hidden rounded-lg">
      <button type="button" className="block w-full" aria-label={`View ${alt}`} onClick={() => show('photo')}><img src={src} alt={alt} className={className} /></button>
      {showPreview && preview(false)}
    </div>
    <Dialog fullScreen={fullScreen} open={open} onOpenChange={close} panelClassName="max-w-4xl">
      <DialogHeader className={fullScreen ? "shrink-0 px-3 py-2 pr-16" : undefined}><DialogTitle>{mode === 'read' ? 'Photo label' : alt}</DialogTitle></DialogHeader>
      <DialogContent className={fullScreen ? "flex flex-1 flex-col overflow-hidden p-2" : undefined}><div className={fullScreen ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-3"}>
        {fullScreen ? <>
          <ZoomablePhoto key={`${displayedSrc}:full`} src={displayedSrc} alt={alt} fullScreen />
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">{directionLabel(direction)}</span>
            {original && <Button type="button" variant="outline" size="sm" onClick={() => setShowOriginal(value => !value)}>{showOriginal ? "Show edited" : "Show original"}</Button>}
            <Button type="button" variant="outline" size="sm" onClick={() => setFullScreen(false)}>Exit full screen</Button>
          </div>
        </> : <>
        {mode === 'draw' && onEdit ? <PhotoEditor src={editTarget.current?.src || src} onDirty={setDrawingDirty} onCancel={() => {
          if (!drawingDirty || confirm('Discard your unsaved drawing?')) { setDrawingDirty(false); setMode('photo'); }
        }} onSave={async dataUrl => {
          setSaving(true);
          try { const target = editTarget.current!; const bytes = await readPhotoBytes(target.src); await target.save(photoWithOriginal(dataUrl, bytes)); setShowOriginal(false); setDrawingDirty(false); setMode('photo'); setMessage('Photo edited.'); }
          finally { setSaving(false); }
        }} /> : mode === 'read' ? <><p className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap break-words text-base leading-relaxed">{caption}</p><Button type="button" variant="outline" onClick={() => setMode('photo')}>Back to photo</Button></> : <>
          <p className="text-sm text-muted-foreground">{directionLabel(direction)}</p>
          <ZoomablePhoto key={`${displayedSrc}:${open}`} src={displayedSrc} alt={alt} caption={mode === 'photo' && preview(true)} />
          {mode === 'photo' && original && <Button type="button" variant="outline" aria-pressed={showOriginal} onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Show edited' : 'Show original'}</Button>}
          {mode === 'photo' && original && <p className="text-xs text-muted-foreground">{showOriginal ? 'Original photo' : 'Edited photo'}</p>}
          {mode === 'edit' ? <div className="space-y-2">
            <Textarea aria-label="Photo label" autoFocus maxLength={2000} rows={4} value={draft} disabled={saving} onChange={event => setDraft(event.target.value)} placeholder="Describe what is in this picture…" />
            <p className="text-xs text-muted-foreground">{draft.length}/2,000 characters · Two lines appear on the photo. Tap them to read the full label.</p>
            <div className="flex gap-2"><Button type="button" disabled={saving} onClick={async () => {
              if (!onSave) return;
              setSaving(true); setError('');
              try { await onSave(draft.trim()); setMode('photo'); setMessage(saveMessage); }
              catch (error) { setError(error instanceof Error ? error.message : 'Label could not be saved. Please try again.'); }
              finally { setSaving(false); }
            }}>{saving ? 'Saving…' : 'Save label'}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => { setMode('photo'); setError(''); }}>Cancel</Button></div>
          </div> : <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setFullScreen(true)}>Full screen</Button><SavePhotoButton src={displayedSrc} fileName={alt} showLabel />{onEdit && <Button type="button" className="flex-1" onClick={() => { editTarget.current = { src, save: onEdit }; setDrawingDirty(false); setMode("draw"); setMessage(""); }}>Edit photo</Button>}{onSave && <Button type="button" className="flex-1" onClick={() => { setDraft(caption); setMode('edit'); setMessage(''); setError(''); }}>Label</Button>}</div>}
        </>}
        </>}
        {message && !fullScreen && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div></DialogContent>
    </Dialog>
  </>;
}
