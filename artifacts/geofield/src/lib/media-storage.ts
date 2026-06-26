export type StoredMediaKind = "photo" | "video";

export interface StoredMediaMetadata {
  id: string;
  kind: StoredMediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: "indexeddb";
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

function estimateDataUrlSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

export async function storeMediaDataUrl(input: {
  kind: StoredMediaKind;
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
}): Promise<StoredMediaMetadata> {
  const id = crypto.randomUUID();
  const storageKey = `media_${id}`;
  const createdAt = new Date().toISOString();
  const mimeType = input.mimeType || input.dataUrl.match(/^data:([^;]+);/)?.[1] || "application/octet-stream";

  const metadata: StoredMediaMetadata = {
    id,
    kind: input.kind,
    fileName: input.fileName || `${input.kind}-${createdAt}`,
    mimeType,
    sizeBytes: estimateDataUrlSizeBytes(input.dataUrl),
    storage: "indexeddb",
    storageKey,
    createdAt,
    syncStatus: "local",
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ ...metadata, dataUrl: input.dataUrl });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  return metadata;
}

export async function getStoredMediaDataUrl(storageKey: string): Promise<string | null> {
  const db = await openDb();
  const result = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(storageKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return result?.dataUrl || null;
}
