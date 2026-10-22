import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { saveFile } from './save-file';
import { KML_MIME } from './google-earth';

/** Offer Earth a local document; no public URL or cloud upload is needed. */
export async function openGoogleEarth(kml: string): Promise<'chooser' | 'saved'> {
  const filename = `GeoField-${new Date().toISOString().replace(/[:.]/g, '-')}.kml`;
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: `google-earth/${filename}`, data: kml, encoding: Encoding.UTF8,
      directory: Directory.Cache, recursive: true,
    });
    try {
      await FileOpener.open({ filePath: file.uri, contentType: KML_MIME, openWithDefault: false });
      return 'chooser';
    } catch (error: any) {
      if (error?.name === 'AbortError' || /cancel/i.test(error?.message || '')) throw error;
      // Earth may not be installed or registered for KML. Keep a usable file.
    }
  }
  await saveFile(new Blob([kml], { type: KML_MIME }), filename);
  return 'saved';
}
