/** Ignore obsolete/duplicate keys and append newly introduced parameters. */
export function normalizeOrder(keys: string[], saved?: string[]): string[] {
  return [...new Set([...(Array.isArray(saved) ? saved.filter(key => keys.includes(key)) : []), ...keys])];
}
export function moveParameter<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  const result = [...items];
  if (index < 0 || index >= items.length || next < 0 || next >= items.length) return result;
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
