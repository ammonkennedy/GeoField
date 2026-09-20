import { canonicalJson } from "./sample-content.ts";
import type { PlannedSite } from "./trips.ts";
export interface SyncTrip {
  id: string;
  name: string;
  notes: string;
  sites: PlannedSite[];
  datasetId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  localRevision?: string;
  cloudUpdatedAt?: string;
}
interface Store {
  load: () => SyncTrip[];
  save: (trips: SyncTrip[]) => void;
  list: () => Promise<SyncTrip[]>;
  get: (id: string) => Promise<SyncTrip | null>;
  write: (trip: SyncTrip, exists: boolean) => Promise<SyncTrip>;
}
function content(trip: SyncTrip) {
  return canonicalJson({
    name: trip.name,
    notes: trip.notes,
    sites: trip.sites.map(({ queuedSampleId: _, ...site }) => site),
    datasetId: trip.datasetId ?? null,
    deletedAt: trip.deletedAt ?? null,
  });
}
function confirms(actual: SyncTrip | null, expected: SyncTrip): boolean {
  return (
    !!actual &&
    actual.id === expected.id &&
    content(actual) === content(expected)
  );
}
export async function syncTripRecords(store: Store) {
  const before = store.load();
  const remote = await store.list();
  const acknowledged = new Set<string>();
  const errors: unknown[] = [];
  for (const trip of before) {
    if (!trip.localRevision) continue;
    try {
      if (Number(trip.datasetId) < 0)
        throw new Error(
          "A trip's dataset is still waiting to sync. The trip remains saved locally.",
        );
      const existing = await store.get(trip.id);
      if (
        existing &&
        trip.cloudUpdatedAt !== existing.updatedAt &&
        !confirms(existing, trip)
      ) {
        // Preserve the other version before applying this pending edit/deletion.
        const recovery = {
          ...existing,
          id: `${existing.id}-recovered-${Date.parse(existing.updatedAt)}`,
          name: `${existing.name} (other device copy)`,
          deletedAt: null,
        };
        let saved: SyncTrip;
        try {
          saved = await store.write(recovery, false);
        } catch (error) {
          const found = await store.get(recovery.id);
          if (!confirms(found, recovery)) throw error;
          saved = found!;
        }
        if (!confirms(saved, recovery))
          throw new Error(
            "Cloud did not confirm the recovered trip. Your edit remains pending.",
          );
        const current = store.load();
        if (!current.some((item) => item.id === saved.id))
          store.save([
            ...current,
            {
              ...saved,
              localRevision: undefined,
              cloudUpdatedAt: saved.updatedAt,
            },
          ]);
      }
      let saved: SyncTrip;
      if (confirms(existing, trip)) saved = existing!;
      else {
        try {
          saved = await store.write(trip, !!existing);
        } catch (error) {
          const found = await store.get(trip.id);
          if (!confirms(found, trip)) throw error;
          saved = found!;
        }
      }
      if (!confirms(saved, trip))
        throw new Error(
          "Cloud did not confirm all trip details. Your complete trip remains pending.",
        );
      store.save(
        store
          .load()
          .map((latest) =>
            latest.id !== trip.id
              ? latest
              : JSON.stringify(latest) === JSON.stringify(trip)
                ? {
                    ...saved,
                    localRevision: undefined,
                    cloudUpdatedAt: saved.updatedAt,
                  }
                : { ...latest, cloudUpdatedAt: saved.updatedAt },
          ),
      );
      acknowledged.add(trip.id);
    } catch (error) {
      errors.push(error);
    }
  }
  const current = store.load();
  const merged = new Map(current.map((trip) => [trip.id, trip]));
  for (const trip of remote) {
    const local = merged.get(trip.id);
    if (acknowledged.has(trip.id) || local?.localRevision) continue;
    if (!local || Date.parse(trip.updatedAt) > Date.parse(local.updatedAt))
      merged.set(trip.id, { ...trip, cloudUpdatedAt: trip.updatedAt });
  }
  store.save([...merged.values()]);
  if (errors.length)
    throw new AggregateError(
      errors,
      errors
        .map((error) =>
          error instanceof Error ? error.message : "A trip could not sync.",
        )
        .slice(0, 3)
        .join(" "),
    );
  return merged.size;
}
