export function retainConcurrentEdits<T extends { id: string }>(current: T[], before: T[], downloaded: T[]): T[] {
  const initial = new Map(before.map((item) => [item.id, item]));
  const latest = new Map(current.map((item) => [item.id, item]));
  const downloadedIds = new Set(downloaded.map((item) => item.id));
  const merged = new Map(current.filter((item) => !initial.has(item.id) || downloadedIds.has(item.id) || JSON.stringify(item) !== JSON.stringify(initial.get(item.id))).map((item) => [item.id, item]));
  for (const item of downloaded) {
    if (initial.has(item.id) && !latest.has(item.id)) continue;
    if (latest.has(item.id) && JSON.stringify(latest.get(item.id)) !== JSON.stringify(initial.get(item.id))) continue;
    merged.set(item.id, item);
  }
  return [...merged.values()];
}

