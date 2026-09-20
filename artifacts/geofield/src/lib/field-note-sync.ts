import type { FieldNote, NotePhoto } from "./field-notes.ts";

interface NoteSyncStore {
  load: () => FieldNote[];
  save: (notes: FieldNote[]) => void;
  list: () => Promise<FieldNote[]>;
  get?: (id: string) => Promise<FieldNote | null>;
  uploadPhoto: (noteId: string, photo: NotePhoto) => Promise<NotePhoto>;
  write: (note: FieldNote, exists: boolean) => Promise<FieldNote>;
  cachePhoto: (photo: NotePhoto) => Promise<NotePhoto>;
}
function withLocalPhotos(note: FieldNote, local?: FieldNote): FieldNote {
  return { ...note, cloudUpdatedAt: note.updatedAt, photos: note.photos.map((photo) => ({ ...photo, localKey: local?.photos.find((item) => item.id === photo.id)?.localKey ?? photo.localKey })) };
}

function confirmsNote(saved: FieldNote | null | undefined, sent: FieldNote) {
  return Boolean(saved && saved.id === sent.id && saved.title === sent.title && saved.body === sent.body && (saved.deletedAt ?? null) === (sent.deletedAt ?? null) && saved.photos.length === sent.photos.length && sent.photos.every((photo) => saved.photos.some((item) => item.id === photo.id && item.cloudKey === photo.cloudKey)));
}

export async function syncNoteRecords(store: NoteSyncStore) {
  const before = store.load();
  const remote = await store.list();
  const acknowledged = new Set<string>();

  const errors: unknown[] = [];
  for (const note of before) {
    try {
    if (!note.localRevision) continue;
    const existing = await store.get?.(note.id) ?? remote.find((item) => item.id === note.id);
    const photos: NotePhoto[] = [];
    for (const photo of note.photos) {
      const confirmedKey = existing?.photos.find((item) => item.id === photo.id)?.cloudKey;
      photos.push(photo.cloudKey ? photo : confirmedKey ? { ...photo, cloudKey: confirmedKey } : await store.uploadPhoto(note.id, photo));
    }
    const { localRevision: _revision, cloudUpdatedAt: _cloudVersion, ...payload } = note;
    const sent = { ...payload, photos };
    if (existing && note.cloudUpdatedAt && existing.updatedAt !== note.cloudUpdatedAt && !confirmsNote(existing, sent)) {
      const recoveryId = `${existing.id}-recovered-${Date.parse(existing.updatedAt)}`;
      if (!remote.some((item) => item.id === recoveryId)) {
        const recovery = { ...existing, id: recoveryId, title: `${existing.title || "Note"} (other device copy)`, deletedAt: null };
        let recovered: FieldNote;
        try { recovered = await store.write(recovery, false); }
        catch (error) {
          const confirmed = await store.get?.(recoveryId);
          if (!confirmsNote(confirmed, recovery)) throw error;
          recovered = confirmed!;
        }
        remote.push(recovered);
        const current = store.load();
        if (!current.some((item) => item.id === recovered.id)) store.save([...current, withLocalPhotos(recovered)]);
      }
    }
    let saved: FieldNote;
    if (confirmsNote(existing, sent)) saved = existing!;
    else try { saved = await store.write(sent, Boolean(existing)); }
    catch (error) {
      const confirmed = await store.get?.(note.id);
      if (!confirmsNote(confirmed, sent)) throw error;
      saved = confirmed!;
    }
    if (!confirmsNote(saved, sent)) throw new Error("Cloud did not confirm your complete field note. It is still saved on this device.");
    // Do not make a later note or photo failure replay this confirmed write.
    store.save(store.load().map((latest) => {
      if (latest.id !== note.id) return latest;
      if (JSON.stringify(latest) === JSON.stringify(note)) return withLocalPhotos({ ...saved, localRevision: undefined }, latest);
      return { ...latest, cloudUpdatedAt: saved.updatedAt, photos: latest.photos.map((photo) => ({ ...photo, cloudKey: saved.photos.find((item) => item.id === photo.id)?.cloudKey ?? photo.cloudKey })) };
    }));
    acknowledged.add(note.id);
    } catch (error) { errors.push(error); }
  }
  // Prefer acknowledged writes over the older listing. Never replace pending
  // text or attachments, including changes made while a photo was uploading.
  const current = store.load();
  const merged = [...current];
  for (const cloud of remote) {
    if (acknowledged.has(cloud.id)) continue;
    const index = merged.findIndex((item) => item.id === cloud.id);
    if (index < 0) merged.push(withLocalPhotos(cloud));
    else if (!merged[index].localRevision && Date.parse(cloud.updatedAt) > Date.parse(merged[index].updatedAt)) merged[index] = withLocalPhotos(cloud, merged[index]);
  }
  store.save(merged);
  // Download photos for offline use. Merge only cache pointers into current
  // storage afterward so this slower step cannot revert typing or deletion.
  for (const note of merged) {
    if (note.deletedAt) continue;
    for (const photo of note.photos) {
      if (!photo.cloudKey) continue;
      try {
      const cached = await store.cachePhoto(photo);
      if (cached.localKey === photo.localKey) continue;
      store.save(store.load().map((current) => current.id !== note.id ? current : { ...current, photos: current.photos.map((item) => item.id === photo.id && item.cloudKey === photo.cloudKey ? { ...item, localKey: cached.localKey } : item) }));
      } catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw new AggregateError(errors, errors.map((error) => error instanceof Error ? error.message : "A record could not sync.").slice(0, 3).join(" "));
  return merged.length;
}
