import type { NotePhoto } from './field-notes.ts';

export const MAX_NOTE_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_TYPES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', '3gp': 'video/3gpp' };
export function noteVideoMime(file: Pick<File, 'type' | 'name' | 'size'>): string {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type.startsWith('video/') ? file.type : (!file.type || file.type === 'application/octet-stream') ? VIDEO_TYPES[extension] : undefined;
  if (!mime) throw new Error('Choose a video file.');
  if (!file.size) throw new Error('This video is empty. Please choose another video.');
  if (file.size > MAX_NOTE_VIDEO_BYTES) throw new Error('Please choose a video smaller than 50 MB.');
  return mime;
}
export function noteMediaMime(media: NotePhoto): string {
  return media.kind === 'video' ? media.mimeType || VIDEO_TYPES[media.fileName.split('.').pop()?.toLowerCase() ?? ''] || 'video/mp4' : 'image/jpeg';
}
export function noteMediaUploadName(media: NotePhoto): string {
  if (media.kind !== 'video') return `${media.id}.jpg`;
  const extension = Object.entries(VIDEO_TYPES).find(([, mime]) => mime === noteMediaMime(media))?.[0] || 'mp4';
  return `${media.id}.${extension}`;
}
/** Keep original video bytes; converting or trimming would discard field evidence. */
export function prepareNoteVideo(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  const mimeType = noteVideoMime(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result), mimeType });
    reader.onerror = () => reject(new Error('Could not read this video. Please try again.'));
    reader.onabort = () => reject(new Error('Reading the video was interrupted. Please try again.'));
    reader.readAsDataURL(file.type === mimeType ? file : new Blob([file], { type: mimeType }));
  });
}
