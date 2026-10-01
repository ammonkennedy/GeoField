import { useState } from 'react';
import { SavePhotoButton } from '@/components/SavePhotoButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function LabeledPhoto({ src, alt, caption = '', onSave, className = 'h-40 w-full object-cover', saveMessage = 'Label saved.', initiallyOpen = false, initiallyRead = false, showPreview = true }: {
  src: string; alt: string; caption?: string;
  onSave?: (label: string) => void | Promise<void>;
  className?: string; saveMessage?: string; initiallyOpen?: boolean; initiallyRead?: boolean; showPreview?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<'photo' | 'edit' | 'read'>(initiallyRead ? 'read' : 'photo');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const show = (next: 'photo' | 'read') => { setMode(next); setMessage(''); setError(''); setOpen(true); };
  const close = (value: boolean) => {
    if (saving) return;
    if (!value && mode === 'edit' && draft !== caption && !confirm('Discard the unsaved photo label?')) return;
    setOpen(value);
  };
  const preview = (inViewer: boolean) => caption ? <button type="button" aria-label="Read full photo label" className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/70 px-2 py-1 text-left text-xs leading-4 text-white" onClick={() => inViewer ? setMode('read') : show('read')}><span className="line-clamp-2 break-words">{caption}</span></button> : null;
  return <>
    <div className="relative overflow-hidden rounded-lg">
      <button type="button" className="block w-full" aria-label={`View ${alt}`} onClick={() => show('photo')}><img src={src} alt={alt} className={className} /></button>
      {showPreview && preview(false)}
    </div>
    <Dialog open={open} onOpenChange={close} panelClassName="max-w-4xl">
      <DialogHeader><DialogTitle>{mode === 'read' ? 'Photo label' : alt}</DialogTitle></DialogHeader>
      <DialogContent><div className="space-y-3">
        {mode === 'read' ? <><p className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap break-words text-base leading-relaxed">{caption}</p><Button type="button" variant="outline" onClick={() => setMode('photo')}>Back to photo</Button></> : <>
          <div className="relative mx-auto w-fit max-w-full"><img src={src} alt={alt} className="max-h-[55dvh] max-w-full rounded-lg object-contain" />{mode === 'photo' && preview(true)}</div>
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
          </div> : <div className="flex gap-2"><SavePhotoButton src={src} fileName={alt} showLabel />{onSave && <Button type="button" className="flex-1" onClick={() => { setDraft(caption); setMode('edit'); setMessage(''); setError(''); }}>Label</Button>}</div>}
        </>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div></DialogContent>
    </Dialog>
  </>;
}
