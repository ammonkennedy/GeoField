import { useEffect, useRef, useState } from "react";
import { useGetCurrentAuthUser, resolveSampleMediaUrl } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, ArrowLeft, Trash2, Undo2, NotebookPen, X } from "lucide-react";
import { Link } from "wouter";
import { createFieldNote, editFieldNote, loadFieldNotes, FIELD_NOTES_UPDATED, prepareNotePhoto, type FieldNote, type NotePhoto } from "@/lib/field-notes";
import { storeMediaDataUrl, getStoredMediaDataUrl } from "@/lib/media-storage";

function NoteImage({ photo }: { photo: NotePhoto }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      let image = photo.localKey ? await getStoredMediaDataUrl(photo.localKey).catch(() => null) : null;
      if (!image && photo.cloudKey) image = await resolveSampleMediaUrl(photo.cloudKey);
      if (active) setUrl(image || "");
    };
    void load().catch(() => { if (active) setUrl(""); });
    return () => { active = false; };
  }, [photo.localKey, photo.cloudKey]);
  return url ? <><button type="button" className="w-full" onClick={() => setOpen(true)} aria-label={`View ${photo.fileName}`}><img src={url} alt={photo.fileName} className="h-40 w-full rounded-lg object-cover" /></button><Dialog open={open} onOpenChange={setOpen} panelClassName="max-w-4xl"><DialogHeader><DialogTitle>Note photo</DialogTitle></DialogHeader><DialogContent><img src={url} alt={photo.fileName} className="max-h-[70dvh] w-full object-contain" /></DialogContent></Dialog></> : <div className="flex h-40 items-center justify-center rounded-lg bg-muted p-3 text-sm text-muted-foreground">Photo unavailable on this device while offline.</div>;
}

function NotesContent({ accountId }: { accountId: string }) {
  const [notes, setNotes] = useState(() => loadFieldNotes(accountId));
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [error, setError] = useState("");
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const note = notes.find((item) => item.id === selected);
  useEffect(() => {
    const refresh = () => setNotes(loadFieldNotes(accountId));
    window.addEventListener(FIELD_NOTES_UPDATED, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(FIELD_NOTES_UPDATED, refresh); window.removeEventListener("storage", refresh); };
  }, [accountId]);
  const open = (item: FieldNote) => { setSelected(item.id); setDraft(null); setError(""); };
  const save = (patch: { title?: string; body?: string }) => {
    if (!note) return;
    const next = { title: draft?.title ?? note.title, body: draft?.body ?? note.body, ...patch };
    setDraft(next);
    try { editFieldNote(accountId, note.id, (current) => ({ ...current, ...next })); setDraft(null); setError(""); }
    catch { setError("Your latest text could not be saved. Keep this page open and try Save again."); }
  };
  const addPhotos = async (files: FileList | null) => {
    if (!note || !files?.length) return;
    const id = note.id;
    setAddingPhotos(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await prepareNotePhoto(file);
        const photo = await storeMediaDataUrl({ kind: "photo", dataUrl, fileName: file.name, mimeType: "image/jpeg" });
        editFieldNote(accountId, id, (current) => ({ ...current, photos: [...current.photos, { id: photo.id, fileName: file.name, localKey: photo.storageKey }] }));
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the photo. Please try again."); }
    finally { setAddingPhotos(false); }
  };
  const back = () => { if (!draft || confirm("Your latest text is not saved. Leave this note anyway?")) { setSelected(null); setDraft(null); setError(""); } };
  const visible = notes.filter((item) => Boolean(item.deletedAt) === showDeleted && `${item.title} ${item.body}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return <div className="mx-auto max-w-4xl space-y-5 pb-8">
    <div className="flex items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><NotebookPen className="h-7 w-7" />Field Notes</h1>
      {!note && <Button onClick={() => { try { open(createFieldNote(accountId)); setShowDeleted(false); } catch { setError("Could not create a note. Check available device storage."); } }}><Plus className="mr-2 h-4 w-4" />New Note</Button>}
    </div>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {note ? <>
      <Button variant="outline" onClick={back} disabled={addingPhotos}><ArrowLeft className="mr-2 h-4 w-4" />All Notes</Button>
      <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <div><Label htmlFor="note-title">Title</Label><Input id="note-title" maxLength={240} autoFocus value={draft?.title ?? note.title} onChange={(event) => save({ title: event.target.value })} placeholder="e.g. North ridge observations" disabled={Boolean(note.deletedAt)} /></div>
        <p className="text-xs text-muted-foreground">Created {new Date(note.createdAt).toLocaleString()} · {draft ? "Unsaved changes" : note.localRevision ? "Saved on this device · waiting to sync" : "Synced with your account"}</p>
        <div><Label htmlFor="note-body">Field notes</Label><Textarea id="note-body" maxLength={50000} value={draft?.body ?? note.body} onChange={(event) => save({ body: event.target.value })} placeholder="Write your observations here…" className="min-h-[300px] text-base leading-relaxed" disabled={Boolean(note.deletedAt)} /></div>
        {draft && <Button onClick={() => save({})}>Save again</Button>}
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Photos (optional)</h2>{!note.deletedAt && <div className="flex gap-2"><Button variant="outline" disabled={addingPhotos || Boolean(draft)} onClick={() => camera.current?.click()}><Camera className="mr-2 h-4 w-4" />Take Photo</Button><Button variant="outline" disabled={addingPhotos || Boolean(draft)} onClick={() => library.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Add Photos</Button></div>}</div>
        {addingPhotos && <p role="status" className="text-sm">Saving photos…</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{note.photos.map((photo) => <div key={photo.id} className="relative"><NoteImage photo={photo} />{!note.deletedAt && <Button size="icon" variant="secondary" className="absolute right-1 top-1" aria-label={`Remove ${photo.fileName}`} onClick={() => { if (!confirm("Remove this photo from the note?")) return; try { editFieldNote(accountId, note.id, (current) => ({ ...current, photos: current.photos.filter((item) => item.id !== photo.id) })); } catch { setError("Could not remove photo. Please try again."); } }}><X className="h-4 w-4" /></Button>}</div>)}</div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void addPhotos(event.target.files); event.target.value = ""; }} />
        <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addPhotos(event.target.files); event.target.value = ""; }} />
        <Button variant="outline" disabled={addingPhotos || Boolean(draft)} onClick={() => {
          if (!note.deletedAt && !confirm("Move this note to Recently deleted? You can restore it later.")) return;
          try { editFieldNote(accountId, note.id, (current) => ({ ...current, deletedAt: note.deletedAt ? null : new Date().toISOString() })); setSelected(null); }
          catch { setError("Could not update the note. Please try again."); }
        }}>{note.deletedAt ? <Undo2 className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}{note.deletedAt ? "Restore Note" : "Delete Note"}</Button>
      </div>
    </> : <>
      <p className="text-muted-foreground">Write field observations and keep related photos together. Notes save automatically, work offline, and sync with your account when connected.</p>
      <div className="flex gap-2"><Input aria-label="Search notes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes…" /><Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? "Active Notes" : "Recently deleted"}</Button></div>
      {!visible.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{showDeleted ? "No deleted notes." : "No notes yet. Create a note to start writing."}</div>}
      <div className="space-y-3">{visible.map((item) => <button key={item.id} className="block w-full rounded-xl border bg-card p-4 text-left hover:bg-muted/50" onClick={() => open(item)}><h2 className="font-semibold">{item.title || "Untitled note"}</h2><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.body || "No text yet"}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleString()} · {item.photos.length} photo{item.photos.length === 1 ? "" : "s"}</p></button>)}</div>
    </>}
  </div>;
}

export default function FieldNotesPage() {
  const { data } = useGetCurrentAuthUser();
  return <Layout>{data?.user ? <NotesContent key={String(data.user.id)} accountId={String(data.user.id)} /> : <div className="space-y-4"><h1 className="text-3xl font-bold">Field Notes</h1><p>Sign in to save field notes and photos.</p><Link href="/login"><Button>Sign In</Button></Link></div>}</Layout>;
}
