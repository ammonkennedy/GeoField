import { macrostratSourceQueryUrl, macrostratUnitQueryUrl } from "./macrostrat-config.ts";
import type { MacrostratApiEnvelope, MacrostratSelection, MacrostratUnit } from "./macrostrat-types.ts";

const sourceCache = new Map<string, Promise<string | undefined>>();
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

function responseRows(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const envelope = payload as MacrostratApiEnvelope;
  return Array.isArray(envelope.success?.data) ? envelope.success!.data! : Array.isArray(envelope.data) ? envelope.data : [];
}

function asUnit(value: unknown): MacrostratUnit | null {
  return value && typeof value === "object" ? value as MacrostratUnit : null;
}

export function parseMacrostratSelection(payload: unknown): MacrostratSelection | null {
  const units = responseRows(payload).map(asUnit).filter((unit): unit is MacrostratUnit => unit !== null);
  const unit = units[0];
  if (!unit) return null;
  const displayName = text(unit.name) || text(unit.strat_name_long) || text(unit.strat_name) || text(unit.map_unit_name) || (unit.map_id != null ? `Map unit ${unit.map_id}` : undefined);
  if (!displayName) return null;
  const top = text(unit.t_int_name);
  const bottom = text(unit.b_int_name);
  const envelope = payload as MacrostratApiEnvelope;
  const responseReference = unit.source_id == null ? undefined : text(envelope.success?.refs?.[String(unit.source_id)]);
  return {
    unit,
    displayName,
    age: text(unit.age) || (top || bottom ? [top, bottom].filter(Boolean).join(" – ") : undefined),
    lithology: text(unit.lith),
    description: text(unit.descrip) || text(unit.comments),
    source: text(unit.source) || text(unit.ref) || responseReference || [unit.ref_authors, unit.ref_year, unit.ref_title, unit.ref_source].map(text).filter(Boolean).join(". ") || undefined,
    color: text(unit.color),
  };
}

async function sourceReference(sourceId: string | number, signal?: AbortSignal) {
  const key = String(sourceId);
  if (!sourceCache.has(key)) {
    sourceCache.set(key, fetch(macrostratSourceQueryUrl(sourceId), { signal }).then(async (response) => {
      if (!response.ok) return undefined;
      const row = responseRows(await response.json())[0];
      if (!row || typeof row !== "object") return undefined;
      const source = row as Record<string, unknown>;
      return text(source.ref) || text(source.name) || text(source.title);
    }).catch((error) => {
      sourceCache.delete(key);
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return undefined;
    }));
  }
  return sourceCache.get(key)!;
}

export async function queryMacrostratGeology(latitude: number, longitude: number, signal?: AbortSignal) {
  const response = await fetch(macrostratUnitQueryUrl(latitude, longitude), { signal });
  if (!response.ok) throw new Error(`Macrostrat request failed (${response.status})`);
  const selection = parseMacrostratSelection(await response.json());
  return enrichMacrostratSelection(selection, signal);
}

export async function enrichMacrostratSelection(selection: MacrostratSelection | null, signal?: AbortSignal) {
  if (!selection || selection.source || selection.unit.source_id == null) return selection;
  return { ...selection, source: await sourceReference(selection.unit.source_id, signal) };
}

export function clearMacrostratSourceCache() {
  sourceCache.clear();
}
