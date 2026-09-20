import { getFieldNote, getFieldNotes, saveCloudFieldNote, uploadSampleMedia, resolveSampleMediaUrl, requireFieldNoteAccount, type CloudFieldNote } from "@workspace/api-client-react";
import { loadFieldNotes, storeFieldNotes } from "./field-notes";
import { getStoredMediaDataUrl, storeMediaDataUrl } from "./media-storage";
import { syncNoteRecords } from "./field-note-sync";

export async function syncFieldNotes(accountId: string) {
  if (!accountId) return 0;
  return syncNoteRecords({
    load: () => loadFieldNotes(accountId),
    save: (notes) => storeFieldNotes(accountId, notes),
    list: () => getFieldNotes(accountId),
    get: (id) => getFieldNote(id, accountId),
    write: (note, exists) => saveCloudFieldNote({ ...note, photos: note.photos.map(({ id, fileName, cloudKey }) => ({ id, fileName, cloudKey: cloudKey! })) } as CloudFieldNote, exists, accountId),
    uploadPhoto: async (noteId, photo) => {
      const dataUrl = photo.localKey ? await getStoredMediaDataUrl(photo.localKey) : null;
      if (!dataUrl) throw new Error("A note photo is unavailable on this device. The note has not been overwritten in the cloud.");
      const uploaded = await uploadSampleMedia({ sampleId: `note-${noteId}`, localUri: dataUrl, fileName: `${photo.id}.jpg`, mimeType: "image/jpeg", expectedAccountId: accountId });
      return { ...photo, cloudKey: uploaded.storageKey };
    },
    cachePhoto: async (photo) => {
      await requireFieldNoteAccount(accountId);
      if (photo.localKey && await getStoredMediaDataUrl(photo.localKey)) return photo;
      const url = await resolveSampleMediaUrl(photo.cloudKey!);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("Network error while downloading note photos. They will retry when connected.");
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
      });
      const stored = await storeMediaDataUrl({ kind: "photo", dataUrl, fileName: photo.fileName, mimeType: "image/jpeg" });
      return { ...photo, localKey: stored.storageKey };
    },
  });
}
