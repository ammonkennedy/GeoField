import {
  getCloudTrips,
  getCloudTrip,
  saveCloudTrip,
} from "@workspace/api-client-react";
import { assertStorageAccount } from "./storage-account";
import { syncTripRecords } from "./trip-sync";
import {
  loadSyncTrips,
  storeSyncTrips,
  reconcileTripSites,
} from "./trip-sync-storage";

export async function syncTrips(accountId: string) {
  const check = () => assertStorageAccount(accountId);
  try {
    return await syncTripRecords({
      load: () => {
        check();
        return loadSyncTrips();
      },
      save: (trips) => {
        check();
        storeSyncTrips(trips);
      },
      list: () => getCloudTrips(accountId),
      get: (id) => getCloudTrip(id, accountId),
      write: (trip, exists) => saveCloudTrip(trip, exists, accountId),
    });
  } finally {
    check();
    reconcileTripSites();
  }
}
