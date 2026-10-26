import { readDurableArray, writeDurableArray } from "../durable-storage.ts";
import { assertStorageAccount } from "../storage-account.ts";
import { repairImportedPlanes, type Stereonet } from "./model.ts";
import { validateSnapshot } from "./sync.ts";
export const STEREONETS_UPDATED = "geofield-stereonets-updated";
const KEY = "geofield_stereonets";
export function loadStereonets(includeDeleted = false): Stereonet[] {
  const saved = readDurableArray<Stereonet>(KEY);
  for (const net of saved)
    validateSnapshot({ schema: 1, revision: "local-validation", net });
  const repaired = saved.map((net) => {
    const next = repairImportedPlanes(net);
    return next === net
      ? net
      : {
          ...next,
          updatedAt: new Date().toISOString(),
          localRevision: crypto.randomUUID(),
        };
  });
  if (repaired.some((net, i) => net !== saved[i]))
    writeDurableArray(KEY, repaired);
  return repaired.filter((n) => includeDeleted || !n.deletedAt);
}
export function storeStereonets(nets: Stereonet[]) {
  for (const net of nets)
    validateSnapshot({ schema: 1, revision: "local-validation", net });
  writeDurableArray(KEY, nets);
  window.dispatchEvent(new Event(STEREONETS_UPDATED));
}
/** Compare revisions before saving so another tab/device cannot silently lose an edit. */
export function saveStereonet(net: Stereonet, accountId: string | null) {
  assertStorageAccount(accountId);
  const all = loadStereonets(true),
    old = all.find((n) => n.id === net.id);
  if (
    old &&
    (old.localRevision !== net.localRevision ||
      old.cloudRevision !== net.cloudRevision)
  )
    throw new Error(
      "This stereonet changed in another window or sync. Reopen it before editing. Your draft is still displayed.",
    );
  const saved = {
    ...net,
    updatedAt: new Date().toISOString(),
    localRevision: crypto.randomUUID(),
  };
  storeStereonets([...all.filter((n) => n.id !== net.id), saved]);
  return saved;
}
