import { assertStorageAccount, getStorageAccountId } from "./storage-account.ts";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { nativeMediaKey, nativeMediaLocation, mediaDataUrlBytes, mediaDataUrlPayload } from "./native-media.ts";

export type StoredMediaKind = "photo" | "video";

export interface StoredMediaMetadata {
  id: string;
  kind: StoredMediaKind;
  fileName: string;
  caption?: string;
  mimeType: string;
  sizeBytes: number;
  storage: "indexeddb" | "filesystem";
  storageKey: string;
  createdAt: string;
  syncStatus: "local" | "synced";
  cloudUrl?: string;
}

const DB_NAME = "geofield_media_store";
const STORE_NAME = "media";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeMediaDataUrl(input: {
  kind: StoredMediaKind;
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
}): Promise<StoredMediaMetadata> {
  const id = crypto.randomUUID();
  const account = getStorageAccountId();
  const native = Capacitor.isNativePlatform();
  if (native) assertStorageAccount(account);
  const decoded = mediaDataUrlPayload(input.dataUrl);
  const storageKey = native ? nativeMediaKey(id, decoded.mime, account!) : `media_${id}`;
  const createdAt = new Date().toISOString();
  const mimeType = decoded.mime;

  const metadata: StoredMediaMetadata = {
    id,
    kind: input.kind,
    fileName: input.fileName || `${input.kind}-${createdAt}`,
    mimeType,
    sizeBytes: decoded.sizeBytes,
    storage: native ? "filesystem" : "indexeddb",
    storageKey,
    createdAt,
    syncStatus: "local",
  };

  if (native) {
    const location = nativeMediaLocation(storageKey)!;
    await Filesystem.writeFile({ path: location.path, directory: Directory.Data, data: decoded.base64, recursive: true });
    const verified = await Filesystem.readFile({ path: location.path, directory: Directory.Data });
    assertStorageAccount(account);
    if (verified.data !== decoded.base64) throw new Error("Could not verify the saved photo/video. Keep this sheet open and retry.");
  } else {
    const bytes = mediaDataUrlBytes(input.dataUrl).bytes;
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        // Binary storage avoids the overhead of base64 strings. Old data URLs remain readable.
        tx.objectStore(STORE_NAME).put({ ...metadata, blob: new Blob([bytes as BlobPart], { type: decoded.mime }) });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Photo storage was interrupted. Please try saving again."));
        tx.onerror = () => { /* onabort reports failure */ };
      });
    } finally { db.close(); }
  }

  return metadata;
}

export async function getStoredMediaDataUrl(storageKey: string): Promise<string | null> {
  const native = nativeMediaLocation(storageKey);
  if (native) {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const result = await Filesystem.readFile({ path: native.path, directory: Directory.Data });
      return typeof result.data === "string" ? `data:${native.mime};base64,${result.data}` : null;
    } catch (error) {
      if (/does not exist|not found/i.test((error as Error)?.message ?? '')) return null;
      throw error;
    }
  }
  const db = await openDb();
  let result: any;
  try {
    result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(storageKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error ?? new Error("Photo storage read was interrupted."));
    });
  } finally { db.close(); }

  if (result?.blob instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(result.blob);
    });
  }
  return result?.dataUrl || null;
}

/** Remove only this account's new native media after confirmed account deletion. */
export async function removeAccountNativeMedia(account: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.rmdir({ path: `geofield-media/account-${encodeURIComponent(account)}`, directory: Directory.Data, recursive: true });
  } catch (error) {
    if (!/does not exist|not found/i.test((error as Error)?.message ?? '')) throw error;
  }
}
