import { Capacitor, registerPlugin } from '@capacitor/core';
import { saveFile } from './save-file';

const PhotoLibrary = registerPlugin<{
  savePhoto(options: { base64: string; filename: string }): Promise<void>;
}>('GeoFieldPhotoLibrary');

/** Save original image bytes; photo labels remain separate app metadata. */
export async function savePhoto(blob: Blob, filename: string): Promise<'photos' | 'shared' | 'downloaded'> {
  if (!blob.size) throw new Error('The photo is empty. Please open it again and retry.');
  if (Capacitor.getPlatform() !== 'ios') return saveFile(blob, filename);
  if (!Capacitor.isPluginAvailable('GeoFieldPhotoLibrary')) {
    throw new Error('Install the latest GeoField app build to save pictures directly to Photos.');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  await PhotoLibrary.savePhoto({ base64: btoa(binary), filename });
  return 'photos';
}
