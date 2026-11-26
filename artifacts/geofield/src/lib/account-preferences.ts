import { readDurableArray, writeDurableArray } from './durable-storage.ts';
import { assertStorageAccount, getStorageAccountId } from './storage-account.ts';

export const ACCOUNT_PREFERENCES_UPDATED = 'account-preferences-updated';
const KEY = 'geofield_account_preferences';
export interface AccountPreference {
  key: string;
  value: unknown;
  revision: string;
  updatedAt: number;
  pending?: boolean;
  legacy?: boolean;
}
export function loadAccountPreferences(): AccountPreference[] {
  return getStorageAccountId() ? readDurableArray<AccountPreference>(KEY) : [];
}
export function readAccountPreference<T>(key: string): T | undefined {
  return loadAccountPreferences().find(item => item.key === key)?.value as T | undefined;
}
function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ACCOUNT_PREFERENCES_UPDATED));
    window.dispatchEvent(new Event('custom-layers-updated'));
  }
}
function store(items: AccountPreference[]) { writeDurableArray(KEY, items); notify(); }
export function writeAccountPreference(key: string, value: unknown) {
  assertStorageAccount(getStorageAccountId());
  const all = loadAccountPreferences();
  const prior = all.find(item => item.key === key);
  const entry: AccountPreference = { key, value, revision: crypto.randomUUID(), updatedAt: Math.max(Date.now(), (prior?.updatedAt ?? 0) + 1), pending: true };
  validatePreference(entry);
  if (value === undefined) throw new Error("Settings must contain a value.");
  // Validate serializability before acknowledging a save.
  store([...all.filter(item => item.key !== key), entry]);
}
export function newerPreference(a: AccountPreference, b: AccountPreference) {
  return a.updatedAt !== b.updatedAt ? a.updatedAt > b.updatedAt : a.revision > b.revision;
}
export function validatePreference(value: unknown): AccountPreference {
  const item = value as AccountPreference;
  if (!item || typeof item.key !== 'string' || typeof item.revision !== 'string' || !/^[a-z0-9_.:-]{1,200}$/i.test(item.key) || !/^[\w-]{1,150}$/.test(item.revision) || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0 || !Object.hasOwn(item, 'value')) {
    throw new Error('Account settings could not be read. Existing settings have been preserved.');
  }
  return { key: item.key, value: item.value, revision: item.revision, updatedAt: item.updatedAt };
}
/** Never overwrite an edit made while a different revision was uploading. */
export function acknowledgePreference(entry: AccountPreference) {
  const all = loadAccountPreferences();
  const current = all.find(item => item.key === entry.key);
  if (current?.revision !== entry.revision) return;
  store(all.map(item => item.key === entry.key ? { ...item, pending: false, legacy: false } : item));
}
export function mergeAccountPreferences(remote: AccountPreference[]) {
  const all = loadAccountPreferences();
  const byKey = new Map(all.map(item => [item.key, item]));
  for (const entry of remote) {
    const prior = byKey.get(entry.key);
    if (prior?.pending && !prior.legacy) continue;
    if (!prior || prior.legacy || newerPreference(entry, prior)) byKey.set(entry.key, { ...entry, pending: false });
  }
  const next = [...byKey.values()];
  if (JSON.stringify(next) !== JSON.stringify(all)) store(next);
}

/** Import old device defaults once for their owner; keep original bytes intact.
 * Imported defaults rank below explicit account saves and existing cloud settings.
 */
export function initializeAccountPreferences() {
  const account = getStorageAccountId();
  if (!account) return;
  const all = loadAccountPreferences();
  const present = new Set(all.map(item => item.key));
  const add = (key: string, value: unknown) => {
    if (present.has(key) || value === undefined) return;
    const entry = { key, value, revision: crypto.randomUUID(), updatedAt: 0, pending: true, legacy: true };
    validatePreference(entry);
    all.push(entry);
    present.add(key);
  };
  const parse = (key: string) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { throw new Error('Saved device settings could not be read. Original settings have been preserved.'); }
  };
  const ownerKey = 'geofield_preferences_legacy_owner';
  const owner = localStorage.getItem(ownerKey) ?? localStorage.getItem('geofield_legacy_data_owner') ?? account;
  if (!localStorage.getItem(ownerKey)) localStorage.setItem(ownerKey, owner);
  if (owner === account) {
    const sheets = parse('geofield_custom_param_templates') ?? {};
    for (const [type, value] of Object.entries(sheets)) add(`sample-sheet:${type}`, Array.isArray(value) ? { labels: value } : value);
    const north = localStorage.getItem('geofield_north_reference');
    if (north === 'true' || north === 'magnetic') add('north-reference', north);
    for (const layer of parse('geofield_custom_layers') ?? []) add(`map-layer:${layer.id}`, layer);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('geofield_export_fmt_')) add(`export-format:${key.slice('geofield_export_fmt_'.length)}`, parse(key));
      if (key.startsWith('geofield_export_cols_')) add(`export-columns:${key.slice('geofield_export_cols_'.length)}`, parse(key));
    }
  }
  for (const entry of readDurableArray<any>('geofield_export_defaults')) add(`export-default:${entry.key}`, entry);
  const presets = parse(`geofield-clinometer-presets:${account}`) ?? {};
  for (const [key, value] of Object.entries(presets)) add(`clinometer:${key}`, value);
  if (all.length !== loadAccountPreferences().length) store(all);
}
