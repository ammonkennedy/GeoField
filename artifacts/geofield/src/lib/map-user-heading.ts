import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Map, GeolocateControl } from 'maplibre-gl';
import { browserHeading, relativeHeading, validHeading } from './map-heading';

interface HeadingReading { magneticHeading?: number; trueHeading?: number; headingAccuracy?: number }
const motion = registerPlugin<{
  start(options: { northReference: 'magnetic' }): Promise<unknown>;
  stop(): Promise<void>;
  addListener(name: 'orientation', callback: (reading: HeadingReading) => void): Promise<PluginListenerHandle>;
}>('GeologyMotion');
const subscribers = new Set<(heading: number | null) => void>();
let nativeListener: PluginListenerHandle | undefined;
let nativeChanges = Promise.resolve();
function reconcileNative() {
  nativeChanges = nativeChanges.then(async () => {
    if (subscribers.size && !nativeListener) {
      nativeListener = await motion.addListener('orientation', reading => {
        const heading = validHeading(reading.trueHeading, reading.headingAccuracy) ?? validHeading(reading.magneticHeading, reading.headingAccuracy);
        subscribers.forEach(callback => callback(heading));
      });
      try { await motion.start({ northReference: 'magnetic' }); }
      catch { await nativeListener.remove(); nativeListener = undefined; }
    } else if (!subscribers.size && nativeListener) {
      await nativeListener.remove(); nativeListener = undefined;
      await motion.stop();
    }
  }).catch(() => { /* Location remains usable without compass hardware. */ });
}

/** Decorate the existing GPS dot; never create a second position marker. */
export function addUserHeading(map: Map, geolocate: GeolocateControl) {
  const container = map.getContainer();
  const native = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('GeologyMotion');
  let disposed = false;
  let started = false;
  let heading: number | null = null;
  let lastReading = 0;
  const paint = () => {
    const dot = container.querySelector<HTMLElement>('.maplibregl-user-location-dot');
    if (!dot) return;
    let fan = dot.querySelector<HTMLElement>('.geofield-heading-fan');
    if (!fan) {
      fan = document.createElement('span'); fan.className = 'geofield-heading-fan';
      fan.setAttribute('aria-hidden', 'true'); dot.prepend(fan);
    }
    fan.hidden = heading === null || document.hidden || Date.now() - lastReading > 5000;
    if (heading !== null) fan.style.transform = `rotate(${relativeHeading(heading, map.getBearing())}deg)`;
  };
  const receive = (value: number | null) => { heading = value; lastReading = Date.now(); paint(); };
  const orientation = (event: DeviceOrientationEvent) => {
    // Relative orientation cannot establish north; do not overwrite a valid
    // absolute reading when browsers emit both event types.
    if (!event.absolute && (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading === undefined) return;
    receive(browserHeading(event, screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0));
  };
  const begin = async () => {
    if (started || disposed) return;
    started = true;
    if (native) { subscribers.add(receive); reconcileNative(); return; }
    try {
      const permission = (window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })?.requestPermission;
      if (permission && await permission.call(window.DeviceOrientationEvent) !== 'granted') { started = false; return; }
      if (disposed) return;
      window.addEventListener('deviceorientationabsolute', orientation);
      window.addEventListener('deviceorientation', orientation);
    } catch { started = false; }
  };
  // iOS browser permission must be requested directly from a user gesture.
  const click = (event: Event) => {
    if ((event.target as Element).closest('.maplibregl-ctrl-geolocate')) void begin();
  };
  const located = () => {
    if (native || !(window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: unknown })?.requestPermission) void begin();
    paint();
  };
  container.addEventListener('click', click, true);
  geolocate.on('geolocate', located);
  map.on('rotate', paint);
  document.addEventListener('visibilitychange', paint);
  const timer = window.setInterval(paint, 1000);
  map.once('remove', () => {
    disposed = true; window.clearInterval(timer);
    container.removeEventListener('click', click, true);
    geolocate.off('geolocate', located); map.off('rotate', paint);
    document.removeEventListener('visibilitychange', paint);
    window.removeEventListener('deviceorientationabsolute', orientation);
    window.removeEventListener('deviceorientation', orientation);
    if (native) { subscribers.delete(receive); reconcileNative(); }
  });
}
