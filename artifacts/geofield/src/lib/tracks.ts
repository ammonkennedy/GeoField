import { fetchTrailGeometry, trailGeometryPoints, type TrailDownload } from './saved-trails';
import { nativeTrackRecording, watchTrackLocation } from './track-location';
import { readDurableArray, writeDurableArray } from './durable-storage';
import { assertStorageAccount, getStorageAccountId } from './storage-account';
import { acceptTrackPoint, validTrackPoint, type TrackPoint } from './track-math';
import type { StoredTrack } from './track-sync';
export type WalkingTrack = StoredTrack;
export const TRACKS_UPDATED = 'geofield-tracks-updated';
export const TRACK_STATUS_UPDATED = 'geofield-track-status';
export function loadTracks(includeDeleted = false): WalkingTrack[] {
  const tracks = readDurableArray<WalkingTrack>('geofield_tracks');
  const migrated = tracks.map(t => !t.localRevision && !t.cloudRevision ? { ...t, localRevision: crypto.randomUUID() } : t);
  if (migrated.some((t,i) => t !== tracks[i])) writeDurableArray('geofield_tracks', migrated);
  return includeDeleted ? migrated : migrated.filter(track => !track.deletedAt);
}
export function storeTracks(tracks: WalkingTrack[]) {
  if (JSON.stringify(readDurableArray('geofield_tracks')) === JSON.stringify(tracks)) return;
  writeDurableArray('geofield_tracks', tracks);
  window.dispatchEvent(new Event(TRACKS_UPDATED));
}
function writeTracks(tracks: WalkingTrack[]) {
  const current = loadTracks(true);
  storeTracks(tracks.map(t => {
    const old = current.find(o => o.id === t.id);
    // Visibility is a device preference, not a cloud edit.
    const { visible: _, ...content } = t;
    const { visible: __, ...previous } = old ?? {};
    return JSON.stringify(content) === JSON.stringify(previous) ? t : { ...t, localRevision: crypto.randomUUID() };
  }));
}
let subscription: Promise<() => Promise<void>> | undefined;
let stopping = false;
let accountId: string | null = null;
let activeId: string | null = null;
let message = '';
let segment = 0;
let lastFix = 0;
document.addEventListener('visibilitychange', () => {
  if (!activeId || nativeTrackRecording()) return;
  segment++;
  status(document.hidden ? 'Recording suspended while GeoField is hidden. Reopen the app to continue.' : 'Waiting for a fresh GPS position…');
});
export function trackingStatus() { return { activeId, message, stopping }; }
function status(text: string) { message = text; window.dispatchEvent(new Event(TRACK_STATUS_UPDATED)); }
export function updateTrack(id: string, patch: Pick<Partial<WalkingTrack>, 'name' | 'visible'>) {
  if (!getStorageAccountId()) throw new Error('Sign in to edit tracks.');
  writeTracks(loadTracks(true).map(track => track.id === id ? { ...track, ...patch } : track));
}
export async function stopTracking() {
  if (stopping) return;
  stopping = true; status('Stopping tracking…');
  try {
    if (subscription) {
      // A permission dialog may still be open; remove the watcher once added.
      const cleanup = await subscription.catch(() => null);
      if (cleanup) await cleanup();
    }
    subscription = undefined;
    if (activeId && accountId === getStorageAccountId()) {
      writeTracks(loadTracks(true).map(track => track.id === activeId ? { ...track, stoppedAt: new Date().toISOString() } : track));
    }
    activeId = null; accountId = null;
    status('Recording stopped. Your track is saved and ready to sync.');
  } catch (error) {
    status('Could not finish stopping the track. Try Stop again; your saved points remain available.');
    throw error;
  } finally { stopping = false; window.dispatchEvent(new Event(TRACK_STATUS_UPDATED)); window.dispatchEvent(new Event(TRACKS_UPDATED)); }
}
export async function startTracking() {
  if (activeId) return;
  accountId = getStorageAccountId();
  if (!accountId) throw new Error('Sign in before recording a track.');
  if (stopping) throw new Error('Wait for the previous track to finish stopping.');
  const id = crypto.randomUUID();
  const track: WalkingTrack = { id, name: `Walk ${new Date().toLocaleString()}`, startedAt: new Date().toISOString(), points: [], visible: true };
  writeTracks([...loadTracks(true), track]);
  activeId = id; segment = 0; lastFix = 0; status('Waiting for an accurate GPS position…');
  try {
    subscription = watchTrackLocation(position => {
      if (activeId !== id || stopping) return;
      try {
        assertStorageAccount(accountId);
        if ((!nativeTrackRecording() && document.hidden) || position.timestamp < Date.parse(track.startedAt) || position.timestamp > Date.now() + 5000) return;
        if (lastFix && position.timestamp - lastFix > 60000) segment++;
        const c = position.coords;
        const point: TrackPoint = { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy,
          timestamp: position.timestamp, elevation: c.altitude, elevationAccuracy: c.altitudeAccuracy, segment };
        if (validTrackPoint(point)) lastFix = position.timestamp;
        const tracks = loadTracks(true), current = tracks.find(t => t.id === id);
        if (!current) throw new Error('The active track is no longer available.');
        if (acceptTrackPoint(current.points, point)) {
          writeTracks(tracks.map(t => t.id === id ? { ...t, points: [...t.points, point] } : t));
        }
        status(c.accuracy > 50 ? 'GPS signal is weak. Waiting for a more accurate position.' : `Recording · GPS accuracy ±${Math.round(c.accuracy)} m`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Could not save location.';
        void stopTracking().then(() => status(`Recording stopped: ${reason} Previously saved points are preserved.`)).catch(() => status(`Recording could not finish saving or stopping: ${reason}. Try Stop again.`));
      }
    }, error => {
      if (activeId !== id || stopping) return;
      if (error.code === 1) { void stopTracking().then(() => status('Location permission denied. Allow precise location, then activate a new track.')).catch(() => status('Location permission denied. Try Stop again.')); }
      else if (error.code === 4) { void stopTracking().then(() => status(`Recording stopped: ${error.message || 'The location service could not start.'} Try activating a new track.`)).catch(() => status('The location service failed. Try Stop again.')); }
      else { segment++; status('GPS connection interrupted. Recording will resume when a position is available.'); }
    });
    await subscription;
  } catch (error) { await stopTracking(); throw error; }
}

export async function downloadTrail(trail: TrailDownload) {
  const owner = getStorageAccountId();
  if (!owner) throw new Error('Sign in before downloading a trail.');
  const existing = loadTracks().find(t => t.downloadedTrail?.source === trail.source && t.downloadedTrail.id === trail.id);
  if (existing) { updateTrack(existing.id, { visible: true }); return existing.id; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const geometry = await fetchTrailGeometry(trail, controller.signal);
    assertStorageAccount(owner);
    const now = new Date().toISOString();
    const points = trailGeometryPoints(geometry, Date.parse(now));
    const tracks = loadTracks(true);
    const duplicate = tracks.find(t => !t.deletedAt && t.downloadedTrail?.source === trail.source && t.downloadedTrail.id === trail.id);
    if (duplicate) { updateTrack(duplicate.id, { visible: true }); return duplicate.id; }
    const id = crypto.randomUUID();
    writeTracks([...tracks, { id, name: trail.name, startedAt: now, stoppedAt: now, visible: true, points,
      downloadedTrail: { source: trail.source, id: trail.id } }]);
    return id;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Trail download timed out. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function deleteTrack(id: string) {
  if (!getStorageAccountId()) throw new Error('Sign in to delete tracks.');
  if (id === activeId) throw new Error('Stop recording before deleting this track.');
  writeTracks(loadTracks(true).map(track => track.id === id ? {
    ...track, deletedAt: new Date().toISOString(), visible: false, points: [],
  } : track));
}
