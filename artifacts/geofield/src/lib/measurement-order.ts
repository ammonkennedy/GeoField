interface DatedMeasurement {
  id: string;
  createdAt?: string;
  date?: string;
}
function timestamp(value?: string): number | undefined {
  if (!value) return undefined;
  // Older records can have a date without a timezone. Interpret that fallback
  // consistently so changing the device timezone cannot reorder the list.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : undefined;
}
/** Original capture order, independent of download order and subsequent edits. */
export function orderMeasurements<T extends DatedMeasurement>(items: readonly T[]): T[] {
  const savedAt = (item: T) => timestamp(item.createdAt) ?? timestamp(item.date) ?? Number.POSITIVE_INFINITY;
  return [...items].sort((a, b) => {
    const left = savedAt(a);
    const right = savedAt(b);
    if (left !== right) return left < right ? -1 : 1;
    // Stable across devices even when timestamps are equal or unavailable.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
