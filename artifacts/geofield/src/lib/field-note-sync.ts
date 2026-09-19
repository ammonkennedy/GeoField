import type { FieldNote, NotePhoto } from "./field-notes.ts";

interface NoteSyncStore {
  load: () => FieldNote[];
  save: (notes: FieldNote[]) => void;
  list: () => Promise<FieldNote[]>;
  uploadPhoto: (noteId: string, photo: NotePhoto) => Promise<NotePhoto>;
  write: (note: FieldNote, exists: boolean) => Promise<FieldNote>;
  cachePhoto: (photo: NotePhoto) => Promise<NotePhoto>;
}
function withLocalPhotos(note: FieldNote, local?: FieldNote): FieldNote {
  return { ...note, photos: note.photos.map((photo) => ({ ...photo, localKey: local?.photos.find((item) => item.id === photo.id)?.localKey ?? photo.localKey })) };
}

export async function syncNoteRecords(store: NoteSyncStore) {
  const before = store.load();
  const remote = await store.list();
  const accepted = new Map<string, { sent: FieldNote; saved: FieldNote }>();
  for (const note of before) {
    if (!note.localRevision) continue;
    const photos: NotePhoto[] = [];
    for (const photo of note.photos) photos.push(photo.cloudKey ? photo : await store.uploadPhoto(note.id, photo));
    const { localRevision: _revision, ...payload } = note;
    const saved = await store.write({ ...payload, photos }, remote.some((item) => item.id === note.id));
    if (saved.id !== note.id || saved.title !== note.title || saved.body !== note.body || (saved.deletedAt ?? null) !== (note.deletedAt ?? null) || saved.photos.length !== photos.length || photos.some((photo) => !saved.photos.some((item) => item.id === photo.id && item.cloudKey === photo.cloudKey))) {
      throw new Error("Cloud did not confirm your complete field note. It is still saved on this device.");
    }
    accepted.set(note.id, { sent: note, saved });
  }
  // Prefer acknowledged writes over the older listing. Never replace pending
  // text or attachments, including changes made while a photo was uploading.
  const current = store.load();
  const merged = [...current];
  for (const cloud of remote) {
    const index = merged.findIndex((item) => item.id === cloud.id);
    if (index < 0) merged.push(cloud);
    else if (!merged[index].localRevision && Date.parse(cloud.updatedAt) > Date.parse(merged[index].updatedAt)) merged[index] = withLocalPhotos(cloud, merged[index]);
  }
  for (const [id, { sent, saved }] of accepted) {
    const index = merged.findIndex((item) => item.id === id);
    if (index < 0) continue;
    if (JSON.stringify(current.find((item) => item.id === id)) === JSON.stringify(sent)) {
      merged[index] = withLocalPhotos({ ...saved, localRevision: undefined }, merged[index]);
    } else {
      // Reuse successfully uploaded files on the next attempt, without clearing
      // the newer revision or restoring a photo the user just removed.
      merged[index] = { ...merged[index], photos: merged[index].photos.map((photo) => ({ ...photo, cloudKey: saved.photos.find((item) => item.id === photo.id)?.cloudKey ?? photo.cloudKey })) };
    }
  }
  store.save(merged);
  // Download photos for offline use. Merge only cache pointers into current
  // storage afterward so this slower step cannot revert typing or deletion.
  for (const note of merged) {
    if (note.deletedAt) continue;
    for (const photo of note.photos) {
      if (photo.localKey || !photo.cloudKey) continue;
      const cached = await store.cachePhoto(photo);
      store.save(store.load().map((current) => current.id !== note.id ? current : { ...current, photos: current.photos.map((item) => item.id === photo.id && item.cloudKey === photo.cloudKey ? { ...item, localKey: cached.localKey } : item) }));
    }
  }
  return merged.length;
}
