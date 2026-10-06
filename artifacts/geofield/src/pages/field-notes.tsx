import { getStorageAccountId } from "@/lib/storage-account";
import { LabeledPhoto } from "@/components/LabeledPhoto";
import { createNoteFolder, loadNoteFolders, updateFolderNotes, NOTE_FOLDERS_UPDATED } from "@/lib/note-folders";
import { useEffect, useRef, useState } from "react";
import { useGetCurrentAuthUser, resolveSampleMediaUrl } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, ArrowLeft, Trash2, Undo2, NotebookPen, FolderOpen, X } from "lucide-react";
import { Link } from "wouter";
import { createFieldNote, editFieldNote, loadFieldNotes, FIELD_NOTES_UPDATED, prepareNotePhoto, type FieldNote, type NotePhoto } from "@/lib/field-notes";
import { storeMediaDataUrl, getStoredMediaDataUrl } from "@/lib/media-storage";

function NoteImage({ photo, onSave, onEdit }: { photo: NotePhoto; onSave?: (label: string) => void; onEdit?: (dataUrl: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
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
  return url ? <LabeledPhoto src={url} alt={photo.fileName} caption={photo.caption} onSave={onSave} onEdit={onEdit} /> : <div className="flex h-40 items-center justify-center rounded-lg bg-muted p-3 text-sm text-muted-foreground">Photo unavailable on this device while offline.</div>;
}

function NotesContent({ accountId }: { accountId: string }) {
  const [notes, setNotes] = useState(() => loadFieldNotes(accountId));
  const [folders, setFolders] = useState(() => loadNoteFolders(accountId));
  const [folderId, setFolderId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [addingNotes, setAddingNotes] = useState(false);
  const [chosenNotes, setChosenNotes] = useState<string[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [dialogError, setDialogError] = useState("");
  const folder = folders.find(item => item.id === folderId && !item.deletedAt);
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
    const refresh = () => { setNotes(loadFieldNotes(accountId)); setFolders(loadNoteFolders(accountId)); };
    window.addEventListener(FIELD_NOTES_UPDATED, refresh);
    window.addEventListener(NOTE_FOLDERS_UPDATED, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(NOTE_FOLDERS_UPDATED, refresh); window.removeEventListener(FIELD_NOTES_UPDATED, refresh); window.removeEventListener("storage", refresh); };
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
  const visible = notes.filter((item) => (!folder || folder.noteIds.includes(item.id)) && Boolean(item.deletedAt) === showDeleted && `${item.title} ${item.body}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const createdA = Date.parse(a.createdAt) || 0;
    const createdB = Date.parse(b.createdAt) || 0;
    // A stable ID tie-breaker keeps simultaneous creations consistent after sync.
    return createdB - createdA || a.id.localeCompare(b.id);
  });
  return <div className="mx-auto max-w-4xl space-y-5 pb-8">
    <div className="flex items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><NotebookPen className="h-7 w-7" />Field Notes</h1>
      {!note && <Button onClick={() => {
        try {
          const created = createFieldNote(accountId); open(created); setShowDeleted(false);
          if (folder) {
            try { updateFolderNotes(accountId, folder.id, [created.id]); }
            catch { setError("Your new note is saved in All Notes, but could not be added to this folder. Return to the folder and use Add notes to try again."); }
          }
        } catch { setError("Could not create a note. Check available device storage."); }
      }}><Plus className="mr-2 h-4 w-4" />Create note</Button>}
    </div>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {note ? <>
      <Button variant="outline" onClick={back} disabled={addingPhotos}><ArrowLeft className="mr-2 h-4 w-4" />{folder ? folder.name : "All Notes"}</Button>
      <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <div><Label htmlFor="note-title">Title</Label><Input id="note-title" maxLength={240} autoFocus value={draft?.title ?? note.title} onChange={(event) => save({ title: event.target.value })} placeholder="e.g. North ridge observations" disabled={Boolean(note.deletedAt)} /></div>
        <p className="text-xs text-muted-foreground">Created {new Date(note.createdAt).toLocaleString()} · {draft ? "Unsaved changes" : note.localRevision ? "Saved on this device · waiting to sync" : "Synced with your account"}</p>
        <div><Label htmlFor="note-body">Field notes</Label><Textarea id="note-body" maxLength={50000} value={draft?.body ?? note.body} onChange={(event) => save({ body: event.target.value })} placeholder="Write your observations here…" className="min-h-[300px] text-base leading-relaxed" disabled={Boolean(note.deletedAt)} /></div>
        {draft && <Button onClick={() => save({})}>Save again</Button>}
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Photos (optional)</h2>{!note.deletedAt && <div className="flex gap-2"><Button variant="outline" disabled={addingPhotos || Boolean(draft)} onClick={() => camera.current?.click()}><Camera className="mr-2 h-4 w-4" />Take Photo</Button><Button variant="outline" disabled={addingPhotos || Boolean(draft)} onClick={() => library.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Add Photos</Button></div>}</div>
        {addingPhotos && <p role="status" className="text-sm">Saving photos…</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{note.photos.map((photo) => <div key={photo.id} className="relative"><NoteImage photo={photo} onEdit={note.deletedAt ? undefined : async dataUrl => {
          const stored = await storeMediaDataUrl({ kind: "photo", dataUrl, fileName: "edited-photo.jpg", mimeType: "image/jpeg" });
          if (getStorageAccountId() !== accountId) throw new Error("Account changed. Reopen this photo.");
          editFieldNote(accountId, note.id, current => {
            const original = current.photos.find(item => item.id === photo.id);
            if (current.deletedAt || !original || original.localKey !== photo.localKey || original.cloudKey !== photo.cloudKey) throw new Error("This photo changed while editing. Please reopen it.");
            // A new photo ID creates a new cloud object, preserving concurrent copies.
            return { ...current, photos: current.photos.map(item => item.id === photo.id ? { ...item, id: stored.id, fileName: "edited-photo.jpg", localKey: stored.storageKey, cloudKey: undefined } : item) };
          });
        }} onSave={note.deletedAt ? undefined : label => {
          editFieldNote(accountId, note.id, current => {
            if (current.deletedAt || !current.photos.some(item => item.id === photo.id)) throw new Error("This photo is no longer available in the note.");
            return { ...current, photos: current.photos.map(item => item.id === photo.id ? { ...item, caption: label } : item) };
          });
        }} />{!note.deletedAt && <Button size="icon" variant="secondary" className="absolute right-1 top-1" aria-label={`Remove ${photo.fileName}`} onClick={() => { if (!confirm("Remove this photo from the note?")) return; try { editFieldNote(accountId, note.id, (current) => ({ ...current, photos: current.photos.filter((item) => item.id !== photo.id) })); } catch { setError("Could not remove photo. Please try again."); } }}><X className="h-4 w-4" /></Button>}</div>)}</div>
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
      {folder ? <div className="space-y-3">
        <Button variant="outline" onClick={() => { setFolderId(null); setSearch(""); setShowDeleted(false); }}><ArrowLeft className="mr-2 h-4 w-4" />All Notes</Button>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="min-w-0"><h2 className="flex items-center gap-2 text-xl font-semibold break-words"><FolderOpen className="h-5 w-5 shrink-0 text-primary" />{folder.name}</h2><p className="text-xs text-muted-foreground">{folder.localRevision ? "Saved on this device · waiting to sync" : "Synced with your account"}</p></div>
          <Button variant="outline" onClick={() => { setChosenNotes([]); setAddSearch(""); setDialogError(""); setAddingNotes(true); }}>Add notes</Button>
        </div>
      </div> : <div className="space-y-3">
        <Button variant="outline" onClick={() => { setFolderName(""); setDialogError(""); setCreatingFolder(true); }}><FolderOpen className="mr-2 h-4 w-4" />Create folder</Button>
        <div className="grid gap-3 sm:grid-cols-2">{folders.filter(item => !item.deletedAt).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.id.localeCompare(b.id)).map(item => <button key={item.id} className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-left hover:bg-primary/10" onClick={() => { setFolderId(item.id); setSearch(""); setShowDeleted(false); }}>
          <span className="flex items-center gap-2 font-semibold"><FolderOpen className="h-5 w-5 shrink-0 text-primary" /><span className="break-words min-w-0">{item.name}</span></span>
          <span className="mt-1 block text-xs text-muted-foreground">{notes.filter(note => !note.deletedAt && item.noteIds.includes(note.id)).length} notes</span>
        </button>)}</div>
        <h2 className="text-lg font-semibold">All Notes</h2>
      </div>}
      <div className="flex gap-2"><Input aria-label="Search notes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes…" /><Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? "Active Notes" : "Recently deleted"}</Button></div>
      {!visible.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{showDeleted ? "No deleted notes." : folder ? "No notes in this folder yet. Add existing notes or create a note." : "No notes yet. Create a note to start writing."}</div>}
      <div className="space-y-3">{visible.map((item) => <div key={item.id} className="rounded-xl border bg-card overflow-hidden"><button className="block w-full p-4 text-left hover:bg-muted/50" onClick={() => open(item)}><h2 className="font-semibold">{item.title || "Untitled note"}</h2><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.body || "No text yet"}</p><p className="mt-2 text-xs text-muted-foreground">Created {new Date(item.createdAt).toLocaleString()} · {item.photos.length} photo{item.photos.length === 1 ? "" : "s"}</p></button>
        {folder && !showDeleted && <Button variant="ghost" size="sm" className="mb-2 ml-2" onClick={() => { try { updateFolderNotes(accountId, folder.id, [item.id], true); } catch { setError("Could not remove the note from this folder. Please try again."); } }}>Remove from folder</Button>}
      </div>)}</div>
    </>}

    <Dialog open={creatingFolder} onOpenChange={setCreatingFolder}>
      <DialogHeader><DialogTitle>Create folder</DialogTitle></DialogHeader>
      <DialogContent><form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        try { const created = createNoteFolder(accountId, folderName); setFolderId(created.id); setSearch(""); setShowDeleted(false); setCreatingFolder(false); }
        catch (error) { setDialogError(error instanceof Error ? error.message : "Could not create the folder."); }
      }}><Label htmlFor="note-folder-name">Folder name</Label><Input id="note-folder-name" autoFocus maxLength={120} value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="e.g. Summer field trip" />
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        <Button type="submit" disabled={!folderName.trim()}>Create folder</Button>
      </form></DialogContent>
    </Dialog>
    <Dialog open={addingNotes} onOpenChange={setAddingNotes}>
      <DialogHeader><DialogTitle>Add notes to {folder?.name}</DialogTitle></DialogHeader>
      <DialogContent><div className="space-y-4">
        <p className="text-sm text-muted-foreground">Choose existing notes. They will also remain available in All Notes.</p>
        <Input aria-label="Find notes to add" value={addSearch} onChange={event => setAddSearch(event.target.value)} placeholder="Search existing notes…" />
        <div className="max-h-72 space-y-2 overflow-y-auto">{notes.filter(item => !item.deletedAt && !folder?.noteIds.includes(item.id) && `${item.title} ${item.body}`.toLowerCase().includes(addSearch.toLowerCase())).sort((a,b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.id.localeCompare(b.id)).map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" className="mt-1" checked={chosenNotes.includes(item.id)} onChange={event => setChosenNotes(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
          <span className="min-w-0"><span className="block break-words font-medium">{item.title || "Untitled note"}</span><span className="text-xs text-muted-foreground">Created {new Date(item.createdAt).toLocaleString()}</span></span>
        </label>)}</div>
        {!notes.some(item => !item.deletedAt && !folder?.noteIds.includes(item.id)) && <p className="text-sm text-muted-foreground">No other notes to add. You can create a new note in this folder.</p>}
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        <Button disabled={!folder || !chosenNotes.length} onClick={() => {
          if (!folder) return;
          try { updateFolderNotes(accountId, folder.id, chosenNotes); setAddingNotes(false); }
          catch (error) { setDialogError(error instanceof Error ? error.message : "Could not add notes. Please try again."); }
        }}>Add selected notes ({chosenNotes.length})</Button>
      </div></DialogContent>
    </Dialog>
  </div>;
}

export default function FieldNotesPage() {
  const { data } = useGetCurrentAuthUser();
  return <Layout>{data?.user ? <NotesContent key={String(data.user.id)} accountId={String(data.user.id)} /> : <div className="space-y-4"><h1 className="text-3xl font-bold">Field Notes</h1><p>Sign in to save field notes and photos.</p><Link href="/login"><Button>Sign In</Button></Link></div>}</Layout>;
}
