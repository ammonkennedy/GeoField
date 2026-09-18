import { mergeMeasurements, type MeasurementRecord } from "./merge-measurements.ts";

interface SyncStore<T extends MeasurementRecord> {
  load: () => T[];
  save: (items: T[]) => void;
  list: () => Promise<T[]>;
  create: (item: T) => Promise<T>;
  update: (item: T) => Promise<T>;
}

/** A local revision is acknowledged only by a successful write of that revision. */
export async function syncMeasurementRecords<T extends MeasurementRecord>(store: SyncStore<T>) {
  const before = store.load();
  const remote = await store.list();
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const accepted = new Map<string, { sent: T; saved: T }>();
  for (const item of before) {
    if (Number(item.datasetId) < 0) continue;
    const existing = remoteById.get(item.id);
    if (existing && !item.localRevision && !(Date.parse(item.updatedAt ?? "") > Date.parse(existing.updatedAt ?? ""))) continue;
    // Local-only bookkeeping is never sent to the backend.
    const { localRevision: _revision, ...payload } = item;
    const saved = await (existing ? store.update(payload as T) : store.create(payload as T));
    if (saved.id !== item.id || String(saved.datasetId ?? "") !== String(item.datasetId ?? "")) {
      throw new Error("Cloud did not confirm the measurement's dataset assignment. Your edit is still saved on this device. Please try syncing again.");
    }
    accepted.set(item.id, { sent: item, saved });
  }
  const fresh = await store.list();
  const current = store.load();
  const merged = mergeMeasurements(current, fresh, before);
  // A list request may be stale just after a write. Prefer the acknowledged
  // mutation response, but only if the user has not edited/deleted it meanwhile.
  store.save(merged.map((item) => {
    const acknowledgement = accepted.get(item.id);
    const latest = current.find((record) => record.id === item.id);
    if (!acknowledgement || !latest || JSON.stringify(latest) !== JSON.stringify(acknowledgement.sent)) return item;
    const { localRevision: _revision, ...saved } = acknowledgement.saved;
    return { ...saved, photo: latest.photo } as T;
  }));
  return fresh.length;
}
