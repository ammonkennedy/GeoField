import { validTrackPoint, type TrackPoint } from './track-math.ts';
export interface TrackData {
  id: string; name: string; startedAt: string; stoppedAt?: string;
  points: TrackPoint[];
  downloadedTrail?: { source: "usgs" | "osm"; id: number };
}
export interface StoredTrack extends TrackData {
  visible: boolean; localRevision?: string; cloudRevision?: string;
}
export interface TrackSnapshot {
  schema: 1; revision: string; parent?: string; track: TrackData;
}
export function trackPayload(t: TrackData): TrackData {
  return { id: t.id, name: t.name, startedAt: t.startedAt, stoppedAt: t.stoppedAt, points: t.points, ...(t.downloadedTrail ? { downloadedTrail: t.downloadedTrail } : {}) };
}
export function validateTrackSnapshot(value: unknown): TrackSnapshot {
  const s = value as TrackSnapshot;
  if (s?.schema !== 1 || !/^[\w-]{1,150}$/.test(s.revision) ||
      (s.parent !== undefined && !/^[\w-]{1,150}$/.test(s.parent)) ||
      !s.track || typeof s.track.id !== 'string' || !/^[\w-]{1,250}$/.test(s.track.id) ||
      typeof s.track.name !== 'string' || !Number.isFinite(Date.parse(s.track.startedAt)) ||
      (s.track.stoppedAt !== undefined && !Number.isFinite(Date.parse(s.track.stoppedAt))) ||
      (s.track.downloadedTrail !== undefined && (!s.track.downloadedTrail ||
        !['usgs', 'osm'].includes(s.track.downloadedTrail.source) || !Number.isSafeInteger(s.track.downloadedTrail.id) || s.track.downloadedTrail.id <= 0)) ||
      !Array.isArray(s.track.points) || s.track.points.some(p => !validTrackPoint(p) ||
        !Number.isInteger(p.segment) || p.segment < 0 ||
        (p.elevation !== null && !Number.isFinite(p.elevation)) ||
        (p.elevationAccuracy !== null && (!Number.isFinite(p.elevationAccuracy) || p.elevationAccuracy < 0)))) {
    throw new Error('Cloud track data could not be verified. Local tracks have been preserved.');
  }
  return s;
}
interface Store {
  load(): StoredTrack[];
  save(tracks: StoredTrack[]): void;
  activeId(): string | null;
  list(): Promise<TrackSnapshot[]>;
  put(snapshot: TrackSnapshot): Promise<void>;
  get(snapshot: TrackSnapshot): Promise<TrackSnapshot>;
}
/** Immutable cloud revisions make retries idempotent and preserve concurrent edits. */
export async function syncTrackRecords(store: Store) {
  const errors: unknown[] = [];
  for (const track of store.load()) {
    if (!track.localRevision || track.id === store.activeId()) continue;
    const snapshot: TrackSnapshot = { schema: 1, revision: track.localRevision, parent: track.cloudRevision, track: trackPayload(track) };
    try {
      await store.put(snapshot);
      const confirmed = validateTrackSnapshot(await store.get(snapshot));
      if (JSON.stringify(confirmed) !== JSON.stringify(JSON.parse(JSON.stringify(snapshot)))) throw new Error(`Cloud did not confirm track "${track.name}". It remains saved on this device.`);
      store.save(store.load().map(current => current.id !== track.id ? current : {
        ...current, cloudRevision: snapshot.revision,
        localRevision: current.localRevision === snapshot.revision ? undefined : current.localRevision,
      }));
    } catch (e) { errors.push(e); }
  }
  try {
    const snapshots = (await store.list()).map(validateTrackSnapshot).sort((a,b) => a.revision.localeCompare(b.revision));
    const current = store.load();
    const merged = new Map(current.map(t => [t.id, t]));
    const usedIds = new Set<string>();
    for (const snapshot of snapshots) {
      const originalId = snapshot.track.id;
      const local = merged.get(originalId);
      const known = current.find(t => t.cloudRevision === snapshot.revision);
      if (known) { usedIds.add(originalId); continue; }
      const conflict = usedIds.has(originalId) || Boolean(local?.localRevision) || originalId === store.activeId();
      const id = conflict ? `${originalId}-branch-${snapshot.revision}` : originalId;
      // Never replace an edited recovery copy.
      if (merged.get(id)?.localRevision) continue;
      merged.set(id, { ...snapshot.track, id,
        name: conflict ? `${snapshot.track.name} (other device copy)` : snapshot.track.name,
        visible: local?.visible ?? true, cloudRevision: snapshot.revision });
      usedIds.add(originalId);
    }
    store.save([...merged.values()]);
  } catch (e) { errors.push(e); }
  if (errors.length) throw new AggregateError(errors, errors.map(e => e instanceof Error ? e.message : 'A track could not sync.').slice(0,3).join(' '));
}
