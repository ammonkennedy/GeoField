import { newerPreference, validatePreference, type AccountPreference } from './account-preferences.ts';
export interface PreferenceSyncStore {
  check: () => void;
  load: () => AccountPreference[];
  list: () => Promise<AccountPreference[]>;
  put: (entry: AccountPreference) => Promise<void>;
  get: (entry: AccountPreference) => Promise<unknown>;
  acknowledge: (entry: AccountPreference) => void;
  merge: (entries: AccountPreference[]) => void;
}
export async function syncPreferenceRecords(store: PreferenceSyncStore) {
  store.check();
  const remote = (await store.list()).map(validatePreference);
  store.check();
  // Existing cloud values take precedence over legacy device-only imports.
  store.merge(remote);
  for (const local of store.load().filter(item => item.pending)) {
    const snapshot = validatePreference(local);
    await store.put(snapshot);
    store.check();
    const confirmed = validatePreference(await store.get(snapshot));
    store.check();
    if (JSON.stringify(confirmed) !== JSON.stringify(snapshot)) throw new Error('Cloud did not confirm your settings. They remain saved on this device.');
    store.acknowledge(local);
    remote.push(confirmed);
  }
  // Repeat listing to include simultaneous changes from other devices.
  remote.push(...(await store.list()).map(validatePreference));
  store.check();
  const latest = new Map<string, AccountPreference>();
  for (const entry of remote) {
    const previous = latest.get(entry.key);
    if (!previous || newerPreference(entry, previous)) latest.set(entry.key, entry);
  }
  store.merge([...latest.values()]);
}
