import type { QueuedSample } from "./offline-queue.ts";
import { sameSampleContent, sameSampleAfterUpload, sampleRecoveryId } from "./sample-content.ts";

interface QueueStore {
  load: () => QueuedSample[];
  prepare: (item: QueuedSample) => Promise<QueuedSample["payload"]>;
  create: (id: string, payload: QueuedSample["payload"]) => Promise<unknown>;
  update: (id: string, payload: QueuedSample["payload"], baseUpdatedAt?: string) => Promise<unknown>;
  get: (id: string) => Promise<unknown>;
  cache: (saved: any) => void | Promise<void>;
  delete?: (id: string) => Promise<unknown>;
  restore?: (id: string) => Promise<unknown>;
  remove: (id: string) => void;
  rebase?: (current: QueuedSample, saved: any) => void;
}

async function createConfirmed(id: string, payload: QueuedSample["payload"], store: QueueStore) {
  let saved: any;
  try { saved = await store.create(id, payload); }
  catch (error) {
    try { saved = await store.get(id); } catch { throw error; }
    if (saved?.deletedAt || !sameSampleContent(saved, payload)) {
      // Preserve a remotely edited original and give this exact offline version
      // a deterministic recovery ID. Retrying cannot create duplicate copies.
      id = await sampleRecoveryId(id, payload);
      payload = { ...payload, sampleId: `${payload.sampleId} (recovered edit)` };
      try { saved = await store.create(id, payload); }
      catch (recoveryError) {
        try { saved = await store.get(id); } catch { throw recoveryError; }
        if (saved?.deletedAt || !sameSampleContent(saved, payload)) throw new Error("The recovery copy changed on another device. Your complete local edit is still pending; no cloud data was overwritten.");
      }
    }
  }
  return { id, expected: payload, saved };
}

export async function syncQueuedSample(item: QueuedSample, store: QueueStore) {
  let id = item.targetId ?? item.queuedId;
  let saved: any;
  if (item.deletedAt || item.restore) {
    // Deletion/restoration changes only its marker, never the archived fields.
    try { saved = await store.get(id); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "Sample not found") throw error;
      // A never-uploaded deletion still needs a stable cloud tombstone, but
      // its local-only project ID cannot be sent as a cloud relationship.
      // Keep the original queue/archive untouched for recovery.
      const localProject = Number(item.payload.folderId) < 0;
      const payload = item.deletedAt
        ? { ...item.payload, folderId: localProject ? null : item.payload.folderId }
        : await store.prepare(item);
      try { saved = await store.create(id, payload); }
      catch (createError) { try { saved = await store.get(id); } catch { throw createError; } }
    }
    const change = item.deletedAt ? store.delete : store.restore;
    if (!change) throw new Error("The sample deletion or restoration is still pending.");
    const result = await change(id);
    saved = result ?? await store.get(id);
    if (!saved || String(saved.id) !== id || (item.deletedAt ? !saved.deletedAt : saved.deletedAt != null)) {
      throw new Error("Cloud did not confirm the sample deletion or restoration. The change remains saved locally for retry.");
    }
  } else {
    const payload = await store.prepare(item);
    let expected = payload;
    if (item.targetId) {
      const remote = await store.get(id) as any;
      if (!remote?.deletedAt && sameSampleContent(remote, payload)) saved = remote;
      else if (remote?.deletedAt || !item.baseUpdatedAt || remote.updatedAt !== item.baseUpdatedAt) {
        // Keep the other device's version (including its deletion) intact.
        id = item.queuedId;
        expected = { ...payload, sampleId: `${payload.sampleId} (recovered edit)` };
        ({ saved, id, expected } = await createConfirmed(id, expected, store));
      } else saved = await store.update(id, payload, item.baseUpdatedAt);
    } else ({ saved, id, expected } = await createConfirmed(id, payload, store));
    if (!saved || String(saved.id) !== id || !sameSampleContent(saved, expected)) {
      throw new Error("Cloud did not confirm all sample fields and attachments. The complete local sample remains pending.");
    }
  }
  // Keep a durable downloaded copy BEFORE removing the only local queue copy.
  await store.cache(saved);
  const current = store.load().find((record) => record.queuedId === item.queuedId);
  if (current && JSON.stringify(current) === JSON.stringify(item)) store.remove(item.queuedId);
  else if (current && !item.deletedAt && !item.restore && saved.updatedAt && sameSampleAfterUpload(saved, item.payload)) {
    // This device changed the sample while its previous version was uploading.
    // Continue as an update to that confirmed version, not another create.
    store.rebase?.(current, saved);
  }
  return Boolean(current && JSON.stringify(current) !== JSON.stringify(item));
}
