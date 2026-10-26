import type { Stereonet } from "./model.ts";
export interface NetSnapshot {
  schema: 1;
  revision: string;
  parent?: string;
  net: Stereonet;
}
const safe = (v: unknown): v is string =>
  typeof v === "string" && /^[\w-]{1,250}$/.test(v);
export function validateSnapshot(value: unknown): NetSnapshot {
  const s = value as NetSnapshot,
    n = s?.net;
  const validDate = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  const north = (v: unknown) => v === "magnetic" || v === "true";
  const declination = (v: unknown) =>
    v === undefined ||
    (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 180);
  if (
    s?.schema !== 1 ||
    !safe(s.revision) ||
    (s.parent !== undefined && !safe(s.parent)) ||
    !n ||
    !safe(n.id) ||
    typeof n.name !== "string" ||
    (n.savedDatasetId !== undefined &&
      (typeof n.savedDatasetId !== "string" || !n.savedDatasetId.trim())) ||
    !validDate(n.createdAt) ||
    !validDate(n.updatedAt) ||
    (n.deletedAt !== undefined && !validDate(n.deletedAt)) ||
    !north(n.north) ||
    typeof n.grid !== "boolean" ||
    !["poles", "planes", "both"].includes(n.display) ||
    !Array.isArray(n.groups) ||
    !Array.isArray(n.measurements) ||
    !n.groups.length ||
    n.groups.some(
      (g) =>
        !g ||
        !safe(g.id) ||
        typeof g.name !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(g.color) ||
        !["circle", "square", "triangle"].includes(g.symbol) ||
        typeof g.visible !== "boolean" ||
        !declination(g.declination) ||
        (g.assumedNorth !== undefined && !north(g.assumedNorth)),
    ) ||
    n.measurements.some(
      (m) =>
        !m ||
        !safe(m.id) ||
        !n.groups.some((g) => g.id === m.groupId) ||
        !["plane", "line"].includes(m.kind) ||
        typeof m.name !== "string" ||
        typeof m.notes !== "string" ||
        typeof m.feature !== "string" ||
        !Number.isFinite(m.azimuth) ||
        m.azimuth < 0 ||
        m.azimuth >= 360 ||
        !Number.isFinite(m.inclination) ||
        m.inclination < 0 ||
        m.inclination > 90 ||
        (!north(m.north) && m.north !== "unknown") ||
        !declination(m.declination) ||
        !m.raw ||
        typeof m.raw !== "object" ||
        Array.isArray(m.raw) ||
        !validDate(m.createdAt),
    ) ||
    new Set(n.measurements.map((m) => m.id)).size !== n.measurements.length ||
    new Set(n.groups.map((g) => g.id)).size !== n.groups.length
  )
    throw new Error(
      "Stereonet data could not be verified. Local data has been preserved.",
    );
  return s;
}
interface Store {
  load(): Stereonet[];
  save(nets: Stereonet[]): void;
  put(s: NetSnapshot): Promise<void>;
  get(s: NetSnapshot): Promise<unknown>;
  list(): Promise<NetSnapshot[]>;
}
/** Immutable snapshots, confirmation before acknowledgement, tombstones and explicit conflict copies. */
export async function syncNetRecords(store: Store) {
  const errors: unknown[] = [];
  for (const net of store.load()) {
    if (!net.localRevision) continue;
    const { localRevision, cloudRevision, ...data } = net;
    const snapshot: NetSnapshot = {
      schema: 1,
      revision: localRevision,
      ...(cloudRevision ? { parent: cloudRevision } : {}),
      net: data,
    };
    try {
      validateSnapshot(snapshot);
      await store.put(snapshot);
      const confirmed = validateSnapshot(await store.get(snapshot));
      if (
        JSON.stringify(confirmed) !==
        JSON.stringify(JSON.parse(JSON.stringify(snapshot)))
      )
        throw new Error(
          "Cloud did not confirm the stereonet. Local edits remain pending.",
        );
      store.save(
        store
          .load()
          .map((current) =>
            current.id === net.id
              ? {
                  ...current,
                  cloudRevision: snapshot.revision,
                  localRevision:
                    current.localRevision === snapshot.revision
                      ? undefined
                      : current.localRevision,
                }
              : current,
          ),
      );
    } catch (e) {
      errors.push(e);
    }
  }
  try {
    const snapshots = (await store.list())
      .map(validateSnapshot)
      .sort((a, b) => a.revision.localeCompare(b.revision));
    const current = store.load(),
      merged = new Map(current.map((n) => [n.id, n]));
    for (const s of snapshots.filter((s) => s.net.deletedAt)) {
      const old = merged.get(s.net.id);
      if (!old?.deletedAt)
        merged.set(s.net.id, {
          ...s.net,
          localRevision: undefined,
          cloudRevision: s.revision,
        });
    }
    const seen = new Set<string>();
    for (const s of snapshots) {
      const id = s.net.id,
        old = merged.get(id);
      if (s.net.deletedAt || old?.deletedAt) continue;
      if (current.some((n) => n.cloudRevision === s.revision)) {
        seen.add(id);
        continue;
      }
      const conflict = seen.has(id) || !!old?.localRevision;
      const nextId = conflict ? `${id.slice(0, 90)}-branch-${s.revision}` : id;
      if (merged.get(nextId)?.localRevision) continue;
      merged.set(nextId, {
        ...s.net,
        id: nextId,
        name: s.net.name + (conflict ? " (other device copy)" : ""),
        localRevision: undefined,
        cloudRevision: s.revision,
      });
      seen.add(id);
    }
    store.save([...merged.values()]);
  } catch (e) {
    errors.push(e);
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      errors
        .map((e) => (e instanceof Error ? e.message : "Stereonet sync failed."))
        .slice(0, 3)
        .join(" "),
    );
}
