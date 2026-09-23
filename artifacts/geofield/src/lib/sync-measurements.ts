import {
  mergeMeasurements,
  type MeasurementRecord,
} from "./merge-measurements.ts";

interface SyncStore<T extends MeasurementRecord> {
  load: () => T[];
  save: (items: T[]) => void;
  list: () => Promise<T[]>;
  prepare?: (item: T) => Promise<T>;
  get?: (id: string) => Promise<T | null>;
  create: (item: T) => Promise<T>;
  update: (item: T) => Promise<T>;
}

function confirmsMeasurement<T extends MeasurementRecord>(
  saved: T | null,
  payload: T,
) {
  if (
    !saved ||
    saved.id !== payload.id ||
    String(saved.datasetId ?? "") !== String(payload.datasetId ?? "") ||
    (saved.deletedAt ?? null) !== (payload.deletedAt ?? null)
  )
    return false;
  const normalize = (value: any): any =>
    value && typeof value === "object"
      ? Array.isArray(value)
        ? value.map(normalize)
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, normalize(value[key])]),
          )
      : value;
  const bookkeeping = new Set([
    "photo",
    "photoLocalKey",
    "photoUploadId",
    "photoUploadOnly",
    "createdAt",
    "updatedAt",
    "datasetId",
    "deletedAt",
    "localRevision",
    "cloudUpdatedAt",
  ]);
  return Object.entries(payload).every(
    ([key, value]) =>
      value === undefined ||
      bookkeeping.has(key) ||
      JSON.stringify(normalize(value)) ===
        JSON.stringify(normalize((saved as any)[key])),
  );
}

/** A local revision is acknowledged only by a successful write of that revision. */
export async function syncMeasurementRecords<T extends MeasurementRecord>(
  store: SyncStore<T>,
) {
  const before = store.load();
  const remote = await store.list();
  const remoteById = new Map(remote.map((item) => [item.id, item]));

  const errors: unknown[] = [];
  for (const item of before) {
    try {
      if (Number(item.datasetId) < 0) continue;
      let existing = remoteById.get(item.id);
      if ((!existing || item.localRevision) && store.get)
        existing = (await store.get(item.id)) ?? existing;
      if (!existing && item.cloudUpdatedAt && !item.localRevision) continue;
      if (existing && !item.localRevision) continue;
      let prepared = store.prepare ? await store.prepare(item) : item;
      // Migrating a previously local-only photo must not replay old measurement
      // fields over newer edits (or a deletion) made on another device.
      if (item.photoUploadOnly && existing)
        prepared = {
          ...existing,
          photo: prepared.photo,
          photoLocalKey: prepared.photoLocalKey,
          photoKey: prepared.photoKey,
        };

      if (
        existing &&
        item.localRevision &&
        item.cloudUpdatedAt &&
        existing.updatedAt !== item.cloudUpdatedAt &&
        !confirmsMeasurement(existing, prepared)
      ) {
        const recoveryId = `${existing.id}-recovered-${Date.parse(existing.updatedAt ?? "") || 0}`;
        if (!remoteById.has(recoveryId)) {
          const recovery = {
            ...existing,
            id: recoveryId,
            label: `${existing.label || "Measurement"} (other device copy)`,
            deletedAt: null,
          } as T;
          let recovered: T;
          try {
            recovered = await store.create(recovery);
          } catch (error) {
            const confirmed = await store.get?.(recoveryId);
            if (!confirmed || !confirmsMeasurement(confirmed, recovery))
              throw error;
            recovered = confirmed;
          }
          if (!confirmsMeasurement(recovered, recovery))
            throw new Error("Cloud did not confirm the recovery copy. Both versions are preserved; sync again to retry.");
          remoteById.set(recoveryId, recovered);
          const current = store.load();
          if (!current.some((record) => record.id === recovered.id))
            store.save([
              ...current,
              { ...recovered, cloudUpdatedAt: recovered.updatedAt },
            ]);
        }
      }
      // Local-only bookkeeping is never sent to the backend.
      const {
        localRevision: _revision,
        cloudUpdatedAt: _cloudVersion,
        ...payload
      } = prepared;
      let saved: T;
      if (existing && confirmsMeasurement(existing, payload as T))
        saved = existing;
      else
        try {
          saved = await (existing
            ? store.update(payload as T)
            : store.create(payload as T));
        } catch (error) {
          const confirmed = await store.get?.(item.id);
          if (!confirmed || !confirmsMeasurement(confirmed, payload as T))
            throw error;
          saved = confirmed;
        }
      if (
        saved.id !== item.id ||
        String(saved.datasetId ?? "") !== String(payload.datasetId ?? "") ||
        (saved.deletedAt ?? null) !== (payload.deletedAt ?? null)
      ) {
        throw new Error(
          "Cloud did not confirm the measurement's dataset assignment. Your edit is still saved on this device. Please try syncing again.",
        );
      }
      if (!confirmsMeasurement(saved, payload as T))
        throw new Error(
          "Cloud did not confirm all measurement fields. The full local edit remains pending.",
        );
      // Persist each acknowledgment before another upload/download can fail.
      store.save(
        store.load().map((latest) => {
          if (latest.id !== item.id) return latest;
          if (JSON.stringify(latest) !== JSON.stringify(item))
            return { ...latest, cloudUpdatedAt: saved.updatedAt };
          const { localRevision: _revision, ...confirmed } = saved;
          return {
            ...confirmed,
            cloudUpdatedAt: saved.updatedAt,
            photo: prepared.photo,
            photoLocalKey: prepared.photoLocalKey,
            photoUploadId: undefined,
            photoUploadOnly: undefined,
          } as T;
        }),
      );
    } catch (error) {
      errors.push(error);
    }
  }
  const fresh = await store.list();
  const current = store.load();
  const merged = mergeMeasurements(current, fresh, before);
  // Acknowledged records now differ from the initial snapshot, so stale
  // listings cannot revert them. Other unchanged records can still refresh.
  store.save(merged);
  if (errors.length)
    throw new AggregateError(
      errors,
      errors
        .map((error) =>
          error instanceof Error ? error.message : "A record could not sync.",
        )
        .slice(0, 3)
        .join(" "),
    );
  return fresh.length;
}
