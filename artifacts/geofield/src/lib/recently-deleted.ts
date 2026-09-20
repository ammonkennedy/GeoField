export type LocalDeletedItem = {
  trashId: string;
  kind: "dataset" | "sample" | "measurement";
  name: string;
  deletedAt: string;
  data: any;
};
import { readDurableArray, writeDurableArray } from "./durable-storage.ts";

const KEY = "geofield_recently_deleted";
export const RECENTLY_DELETED_UPDATED_EVENT = "recently-deleted-updated";

function save(items: LocalDeletedItem[]) {
  writeDurableArray(KEY, items);
  window.dispatchEvent(new CustomEvent(RECENTLY_DELETED_UPDATED_EVENT));
}

export function getLocalDeletedItems(): LocalDeletedItem[] {
  return readDurableArray<LocalDeletedItem>(KEY);
}

export function archiveLocalItem(kind: LocalDeletedItem["kind"], name: string, data: any) {
  const deletedAt = new Date().toISOString();
  save([...getLocalDeletedItems(), { trashId: `${kind}_${Date.now()}_${Math.random()}`, kind, name, deletedAt, data }]);
}

export function removeLocalDeletedItem(trashId: string) {
  save(getLocalDeletedItems().filter((item) => item.trashId !== trashId));
}
