import { getPreferenceCloudObject, listPreferenceCloudObjects, putPreferenceCloudObject } from '@workspace/api-client-react';
import { loadAccountPreferences, acknowledgePreference, mergeAccountPreferences, validatePreference, writeAccountPreference } from './account-preferences';
import { assertStorageAccount } from './storage-account';
import { syncPreferenceRecords } from './sync-account-preferences-core';
import { resolveDatasetId } from './dataset-identity';
import { getLocalDatasets } from './local-datasets';
async function syncAccountPreferencesNow(account: string) {
  const check = () => assertStorageAccount(account);
  check();
  const preset = loadAccountPreferences().find(item => item.key === 'clinometer:datasetId' && item.pending);
  if (preset && Number(preset.value) < 0) {
    const resolved = resolveDatasetId(preset.value as string, getLocalDatasets(true));
    if (!(Number(resolved) < 0)) writeAccountPreference(preset.key, resolved == null ? '' : String(resolved));
  }
  await syncPreferenceRecords({
    check, load: () => loadAccountPreferences().filter(item => !(item.key === 'clinometer:datasetId' && Number(item.value) < 0)), acknowledge: acknowledgePreference, merge: mergeAccountPreferences,
    put: entry => putPreferenceCloudObject(entry, entry, account),
    get: entry => getPreferenceCloudObject(entry, account),
    list: async () => {
      const objects = await listPreferenceCloudObjects(account);
      const entries = [];
      for (const object of objects) {
        check();
        const entry = validatePreference(await getPreferenceCloudObject(object, account));
        if (entry.key !== object.key || entry.revision !== object.revision || entry.updatedAt !== object.updatedAt) throw new Error('Cloud settings revision does not match its data.');
        entries.push(entry);
      }
      return entries;
    },
  });
}

const inFlight = new Map<string, Promise<void>>();
export function syncAccountPreferences(account: string): Promise<void> {
  const existing = inFlight.get(account);
  if (existing) return existing;
  const request = syncAccountPreferencesNow(account).finally(() => inFlight.delete(account));
  inFlight.set(account, request);
  return request;
}
