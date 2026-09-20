import { accountCollectionKey } from "./storage-account.ts";
const BACKUP_SUFFIX = "__backup";

/** Never silently replace unreadable data with an empty collection. */
export function readDurableArray<T>(key: string): T[] {
  key = accountCollectionKey(key);
  let found = false;
  for (const candidate of [key, `${key}${BACKUP_SUFFIX}`]) {
    const raw = localStorage.getItem(candidate);
    if (raw === null) continue;
    found = true;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    // Recovery must remain readable even when device storage is full.
    if (candidate !== key) { try { localStorage.setItem(key, raw); } catch {} }
    return parsed as T[];
  }
  if (found) throw new Error("Saved data could not be read. The original data has been preserved; do not clear app storage.");
  return [];
}

/** Keep the last committed value recoverable if a write is interrupted. */
export function writeDurableArray<T>(key: string, items: T[]) {
  key = accountCollectionKey(key);
  const serialized = JSON.stringify(items);
  if (!Array.isArray(JSON.parse(serialized))) throw new Error("Expected a saved collection.");
  // Validate before overwriting either copy. Corruption is never an empty store.
  const previous = readDurableArray<T>(key);
  const hadPrevious = localStorage.getItem(key) !== null || localStorage.getItem(`${key}${BACKUP_SUFFIX}`) !== null;
  if (hadPrevious) localStorage.setItem(`${key}${BACKUP_SUFFIX}`, JSON.stringify(previous));
  else localStorage.setItem(`${key}${BACKUP_SUFFIX}`, serialized);
  localStorage.setItem(key, serialized);
  if (localStorage.getItem(key) !== serialized) throw new Error(`Could not verify saved data for ${key}`);
  // Once committed, both copies should represent the acknowledged save.
  // Failure refreshing redundancy must not report a committed save as lost.
  try { localStorage.setItem(`${key}${BACKUP_SUFFIX}`, serialized); } catch {}
}
