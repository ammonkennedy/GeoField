import { normalizedParameterLabel } from "./export-parameter-names.ts";

type StoredCustomParameter = {
  label: string;
  value: unknown;
};

export function getCustomParameters(fields: Record<string, any>, sampleType?: string): StoredCustomParameter[] {
  let stored = fields.customParams;
  if (typeof stored === "string") {
    try {
      stored = JSON.parse(stored);
    } catch {
      return [];
    }
  }
  if (stored && !Array.isArray(stored) && typeof stored === "object") {
    const record = stored as Record<string, unknown>;
    stored = "label" in record
      ? [record]
      : Object.entries(record).map(([label, value]) => ({ label, value }));
  }
  if (!Array.isArray(stored)) return [];
  const parameters = stored.flatMap((parameter: unknown) => {
    if (!parameter || typeof parameter !== "object") return [];
    const label = String((parameter as Record<string, unknown>).label ?? "").trim();
    if (!label) return [];
    return [{ label, value: (parameter as Record<string, unknown>).value }];
  });
  const groups = new Map<string, StoredCustomParameter[]>();
  const blank = (value: unknown) => value == null || (typeof value === 'string' && !value.trim());
  for (const parameter of parameters) {
    const name = normalizedParameterLabel(parameter.label, sampleType);
    const group = groups.get(name) ?? [];
    // Empty template copies must not shift a real reading into a second column.
    // Keep separate nonempty readings, even if their values happen to match.
    if (!blank(parameter.value)) {
      const empty = group.findIndex(item => blank(item.value));
      if (empty >= 0) group.splice(empty, 1);
      group.push(parameter);
    } else if (!group.length) group.push(parameter);
    groups.set(name, group);
  }
  return [...groups.values()].flat();
}

