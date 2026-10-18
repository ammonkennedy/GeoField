import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
const BackgroundLocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
const TrackingPermissions = registerPlugin<{ request(): Promise<{ granted: boolean }> }>('GeoFieldTrackingPermissions');
export const nativeTrackRecording = () => Capacitor.isNativePlatform();
export async function watchTrackLocation(
  success: (position: GeolocationPosition) => void,
  error: (error: { code: number; message?: string }) => void,
): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) {
    if (!navigator.geolocation) throw new Error('Location is unavailable in this browser.');
    const id = navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return async () => navigator.geolocation.clearWatch(id);
  }
  if (!Capacitor.isPluginAvailable('BackgroundGeolocation')) throw new Error('Install the updated GeoField app to use background tracking.');
  if (Capacitor.getPlatform() === 'android') {
    const permission = await TrackingPermissions.request();
    if (!permission.granted) throw new Error('Allow GeoField notifications so you can see when your walking route is recording.');
  }
  const id = await BackgroundLocation.addWatcher({
    backgroundTitle: 'GeoField is recording your walk',
    backgroundMessage: 'Tap to open GeoField. Use Stop tracking to finish your walk.',
    requestPermissions: true, stale: false, distanceFilter: 3,
  }, (location, failure) => {
    if (failure) { error({ code: failure.code === 'NOT_AUTHORIZED' ? 1 : failure.code ? 2 : 4, message: failure.message }); return; }
    if (!location || location.time === null) return;
    success({ timestamp: location.time, coords: {
      latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy,
      altitude: location.altitude, altitudeAccuracy: location.altitudeAccuracy !== null && location.altitudeAccuracy >= 0 ? location.altitudeAccuracy : null,
      heading: location.bearing, speed: location.speed,
    } } as GeolocationPosition);
  });
  return async () => { await BackgroundLocation.removeWatcher({ id }); };
}
