const BACKUP_SUFFIX = "__backup";

/**
 * Read JSON without treating a corrupt primary value as an empty data set.
 * The last verified copy is restored automatically when possible.
 */
export function readDurableArray<T>(key: string): T[] {
  for (const candidate of [key, `${key}${BACKUP_SUFFIX}`]) {
    const raw = localStorage.getItem(candidate);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (candidate !== key) localStorage.setItem(key, raw);
        return parsed;
      }
    } catch {
      // Try the verified recovery copy.
    }
  }
  return [];
}

/** Write and verify the recovery copy before replacing the primary value. */
export function writeDurableArray<T>(key: string, items: T[]) {
  const serialized = JSON.stringify(items);
  JSON.parse(serialized);
  localStorage.setItem(`${key}${BACKUP_SUFFIX}`, serialized);
  localStorage.setItem(key, serialized);
  if (localStorage.getItem(key) !== serialized) throw new Error(`Could not verify saved data for ${key}`);
}
