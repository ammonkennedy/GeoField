import { Capacitor, registerPlugin } from '@capacitor/core';
import { withPhotoDirection, type PhotoDirection } from './photo-direction';
import { getStorageAccountId } from './storage-account';
const Camera = registerPlugin<{ capture(): Promise<{ base64?: string; cancelled?: boolean; direction?: PhotoDirection }> }>('GeoFieldCamera');
/** Browser/older builds use the file picker; never substitute a pre-camera heading. */
export async function capturePhoto(fallback: () => void, save: (file: File) => Promise<void>, fail: (message: string) => void) {
  if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('GeoFieldCamera')) { fallback(); return; }
  const account = getStorageAccountId();
  try {
    const result = await Camera.capture();
    if (result.cancelled || getStorageAccountId() !== account) return;
    if (!result.base64) throw new Error('The camera did not return a photo.');
    const data = withPhotoDirection('data:image/jpeg;base64,' + result.base64, result.direction || null);
    const blob = await (await fetch(data)).blob();
    await save(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }));
  } catch (error) { fail(error instanceof Error ? error.message : 'Could not take photo. Please try again.'); }
}
