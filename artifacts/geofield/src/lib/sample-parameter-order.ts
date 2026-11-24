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

/** Reuse the template's identities when opening older samples, without changing values. */
export function restoreCustomParameterIds(
  parameters: Array<{ id?: string; label?: string; value?: string }>,
  template?: { labels: string[]; customIds?: string[] },
): Array<{ id: string; label: string; value: string }> {
  const used = new Set<string>();
  const matched = new Set<number>();
  return parameters.map(parameter => {
    const label = parameter.label ?? '';
    const index = template?.labels.findIndex((name, i) => !matched.has(i) && name.trim() === label.trim()) ?? -1;
    if (index >= 0) matched.add(index);
    const preferred = (index >= 0 ? template?.customIds?.[index] : undefined) || parameter.id;
    const id = preferred && !used.has(preferred) ? preferred : `cp_${crypto.randomUUID()}`;
    used.add(id);
    return { id, label, value: parameter.value ?? '' };
  });
}
