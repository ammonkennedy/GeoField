export type LocalDeletedItem = {
  trashId: string;
  kind: "dataset" | "sample";
  name: string;
  deletedAt: string;
  data: any;
};

const KEY = "geofield_recently_deleted";
const RETENTION_MS = 20 * 24 * 60 * 60 * 1000;
export const RECENTLY_DELETED_UPDATED_EVENT = "recently-deleted-updated";

function save(items: LocalDeletedItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(RECENTLY_DELETED_UPDATED_EVENT));
}

export function getLocalDeletedItems(): LocalDeletedItem[] {
  let items: LocalDeletedItem[] = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  const active = items.filter((item) => Date.now() - new Date(item.deletedAt).getTime() < RETENTION_MS);
  if (active.length !== items.length) save(active);
  return active;
}

export function archiveLocalItem(kind: LocalDeletedItem["kind"], name: string, data: any) {
  const deletedAt = new Date().toISOString();
  save([...getLocalDeletedItems(), { trashId: `${kind}_${Date.now()}_${Math.random()}`, kind, name, deletedAt, data }]);
}

export function removeLocalDeletedItem(trashId: string) {
  save(getLocalDeletedItems().filter((item) => item.trashId !== trashId));
}
