import { loadTrips, storeTrips } from "./trips.ts";
import { attachTripDataset, getLocalDatasets } from "./local-datasets.ts";
import { getQueue, setQueue, type QueuedSample } from "./offline-queue.ts";
import { getCachedCloudSamples } from "./cloud-samples.ts";
import type { SyncTrip } from "./trip-sync.ts";

export function loadSyncTrips(): SyncTrip[] {
  const datasets = getLocalDatasets(true);
  return loadTrips(true).map((trip): SyncTrip => {
    const dataset = datasets.find((item) => item.id === trip.datasetId);
    const { datasetId: localId, cloudDatasetId, ...record } = trip;
    return {
      ...record,
      datasetId:
        dataset?.cloudId ??
        cloudDatasetId ??
        (localId ? String(localId) : null),
      sites: trip.sites.map(({ queuedSampleId: _, ...site }) => site),
    };
  });
}

export function storeSyncTrips(trips: SyncTrip[]) {
  const current = new Map(loadTrips(true).map((trip) => [trip.id, trip]));
  storeTrips(
    trips.map((trip) => {
      const cloudId =
        trip.datasetId && !(Number(trip.datasetId) < 0) ? trip.datasetId : null;
      const old = current.get(trip.id);
      const datasetId = cloudId
        ? attachTripDataset(trip.id, cloudId, trip.name).id
        : Number(trip.datasetId) < 0 ? old?.datasetId : undefined;
      return {
        ...trip,
        datasetId,
        cloudDatasetId: cloudId,
      };
    }),
  );
}

/** Rebuild planned-site placeholders locally, but never replace a collected sample. */
export function reconcileTripSites() {
  const trips = loadTrips(true);
  const byId = new Map(trips.map((trip) => [trip.id, trip]));
  const queue = getQueue(true).filter((item) => {
    if (item.payload.fields?.collectionStatus !== "planned") return true;
    const trip = byId.get(item.payload.fields?.tripId);
    return (
      !trip ||
      (!trip.deletedAt &&
        trip.sites.some(
          (site) =>
            site.id === item.payload.fields?.plannedSiteId && !site.collectedAt,
        ))
    );
  });
  const collected = new Set(
    [...getCachedCloudSamples(), ...queue.map((item) => item.payload)]
      .filter((sample) => sample.fields?.collectionStatus !== "planned")
      .map((sample) => sample.fields?.plannedSiteId)
      .filter(Boolean),
  );
  for (const trip of trips) {
    if (trip.deletedAt) continue;
    for (const [index, site] of trip.sites.entries()) {
      if (site.collectedAt || collected.has(site.id)) continue;
      const queuedId = `q_site_${site.id}`;
      const item: QueuedSample = {
        queuedId,
        queuedAt: site.addedAt,
        payload: {
          sampleType: site.sampleType ?? "other",
          sampleId: site.name.trim() || `Site ${index + 1}`,
          folderId: trip.cloudDatasetId ?? trip.datasetId ?? null,
          notes: site.description || "Planned future sample site",
          fields: {
            location: `${site.lat.toFixed(7)}, ${site.lng.toFixed(7)}`,
            otherSampleTitle: site.name,
            collectionStatus: "planned",
            plannedSiteId: site.id,
            tripId: trip.id,
            tripName: trip.name,
          },
        },
      };
      const at = queue.findIndex(
        (existing) => existing.payload.fields?.plannedSiteId === site.id,
      );
      if (at < 0) queue.push(item);
      else if (queue[at].payload.fields?.collectionStatus === "planned")
        queue[at] = { ...item, queuedId: queue[at].queuedId };
    }
  }
  setQueue(queue);
}
