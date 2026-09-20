import { retainConcurrentEdits } from "../lib/sync-snapshot";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from "react";
import {
  getCurrentAuthUser,
  requireFieldNoteAccount,
  deleteSample as deleteCloudSample,
  deleteFolder as deleteCloudFolder,
  createFolder as createCloudFolder,
  createSample as createCloudSample,
  getFolders as getCloudFolders,
  getSample as getCloudSample,
  getSamples as getCloudSamples,
  updateSample as updateCloudSample,
  uploadSampleMedia,
  createStrikeDipMeasurement as createCloudMeasurement,
  getStrikeDipMeasurements as getCloudMeasurements,
  updateStrikeDipMeasurement as updateCloudMeasurement,
} from "@workspace/api-client-react";

export type SampleType = "water" | "rock" | "soil_sand" | "other";

export interface GeoLocation {
  lat: number;
  lon: number;
  altitude: number | null;
  altitudeAccuracy?: number | null;
}

export interface Sample {
  id: string;
  sampleId: string;
  sampleType: SampleType;
  folderId: string | null;
  notes: string;
  fields: Record<string, string>;
  cloudFields?: Record<string, unknown>;
  location: GeoLocation | null;
  photos: string[];
  createdAt: string;
  updatedAt: string;
  media?: Array<{ localUri?: string; storageKey?: string; cloudUrl?: string; kind: "photo" | "video"; fileName: string; mimeType: string }>;
}

export interface Folder {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface StrikeDipMeasurement {
  elevation?: number | null;
  elevationAccuracy?: number | null;
  id: string;
  measurementType?: "plane" | "lineation";
  label: string;
  strike: string;
  dip: string;
  dipDir: string;
  featureType: string;
  location: string;
  date: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  datasetId?: string | null;
  strikeDegrees?: number;
  dipDegrees?: number;
  dipDirectionDegrees?: number;
  trendDegrees?: number;
  plungeDegrees?: number;
  lineVector?: { east: number; north: number; up: number };
}

export interface StratLayer {
  id: string;
  lithology: string;
  color: string;
  thickness: number;
  age: string;
  description: string;
}

export interface StratColumn {
  id: string;
  name: string;
  description: string;
  layers: StratLayer[];
  createdAt: string;
}

const KEYS = {
  samples: "geofield_samples",
  folders: "geofield_folders",
  measurements: "geofield_measurements",
  columns: "geofield_columns",
};

function uid() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

async function load<T>(key: string): Promise<T[]> {
  let found = false;
  for (const candidate of [key, `${key}__backup`]) {
    const raw = await AsyncStorage.getItem(candidate);
    if (raw === null) continue;
    found = true;
    try { const value = JSON.parse(raw); if (Array.isArray(value)) return value; } catch {}
  }
  if (found) throw new Error("Saved data cannot be read. Original data has been preserved.");
  return [];
}

async function save<T>(key: string, data: T[]) {
  const previous = await load<T>(key);
  await AsyncStorage.setItem(`${key}__backup`, JSON.stringify(previous));
  const serialized = JSON.stringify(data);
  await AsyncStorage.setItem(key, serialized);
  if (await AsyncStorage.getItem(key) !== serialized) throw new Error("Could not verify saved data.");
  await AsyncStorage.setItem(`${key}__backup`, serialized).catch(() => {});
}

let localWrites: Promise<unknown> = Promise.resolve();
function commitCollection<T>(key: string, update: (current: T[]) => T[], publish: (items: T[]) => void) {
  const operation = localWrites.catch(() => {}).then(async () => {
    const next = update(await load<T>(key));
    await save(key, next);
    publish(next);
  });
  localWrites = operation;
  return operation;
}


interface DataContextValue {
  samples: Sample[];
  addSample: (s: Omit<Sample, "id" | "createdAt" | "updatedAt">) => Promise<Sample>;
  updateSample: (id: string, updates: Partial<Sample>) => Promise<void>;
  deleteSample: (id: string) => Promise<void>;
  folders: Folder[];
  addFolder: (name: string, description?: string) => Promise<Folder>;
  updateFolder: (id: string, name: string, description?: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  measurements: StrikeDipMeasurement[];
  addMeasurement: (m: Omit<StrikeDipMeasurement, "id" | "createdAt" | "updatedAt">) => Promise<StrikeDipMeasurement>;
  deleteMeasurement: (id: string) => Promise<void>;
  columns: StratColumn[];
  addColumn: (name: string, description?: string) => Promise<StratColumn>;
  updateColumn: (id: string, updates: Partial<StratColumn>) => Promise<void>;
  deleteColumn: (id: string) => Promise<void>;
  isLoaded: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncNow: () => Promise<{ uploaded: number; downloaded: number }>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [measurements, setMeasurements] = useState<StrikeDipMeasurement[]>([]);
  const [columns, setColumns] = useState<StratColumn[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLock = useRef(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      load<Sample>(KEYS.samples),
      load<Folder>(KEYS.folders),
      load<StrikeDipMeasurement>(KEYS.measurements),
      load<StratColumn>(KEYS.columns),
      AsyncStorage.getItem("geofield_last_synced_at"),
    ]).then(([s, f, m, c, lastSync]) => {
      const retainedSamples = s.filter((sample) => (sample.sampleType as string) !== "air");
      // Hidden legacy sample types remain stored; loading is never deletion.
      setSamples(retainedSamples);
      setFolders(f);
      setMeasurements(m);
      setColumns(c);
      setLastSyncedAt(lastSync);
      setIsLoaded(true);
    });
  }, []);

  const archiveDeletion = async (kind: string, id: string, records: Array<{ id: string }>) => {
    const record = records.find((item) => item.id === id);
    if (record) await commitCollection<any>("geofield_deleted_records", (items) => [...items.filter((item) => !(item.kind === kind && item.record.id === id)), { kind, record, deletedAt: new Date().toISOString() }], () => {});
  };

  // Samples
  const addSample = useCallback(async (data: Omit<Sample, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const s: Sample = { ...data, id: uid(), createdAt: now, updatedAt: now };
    await commitCollection<Sample>(KEYS.samples, (prev) => {
      const next = [s, ...prev];
      return next;
    }, setSamples);
    return s;
  }, []);

  const updateSample = useCallback(async (id: string, updates: Partial<Sample>) => {
    await commitCollection<Sample>(KEYS.samples, (prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
      return next;
    }, setSamples);
  }, []);

  const deleteSample = useCallback(async (id: string) => {
    await archiveDeletion("sample", id, await load<Sample>(KEYS.samples));
    await commitCollection<Sample>(KEYS.samples, (prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next;
    }, setSamples);
  }, []);

  // Folders
  const addFolder = useCallback(async (name: string, description = "") => {
    const f: Folder = { id: uid(), name, description, createdAt: new Date().toISOString() };
    await commitCollection<Folder>(KEYS.folders, (prev) => {
      const next = [...prev, f];
      return next;
    }, setFolders);
    return f;
  }, []);

  const updateFolder = useCallback(async (id: string, name: string, description = "") => {
    await commitCollection<Folder>(KEYS.folders, (prev) => {
      const next = prev.map((f) => f.id === id ? { ...f, name, description } : f);
      return next;
    }, setFolders);
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await archiveDeletion("folder", id, await load<Folder>(KEYS.folders));
    await commitCollection<Folder>(KEYS.folders, (prev) => {
      const next = prev.filter((f) => f.id !== id);
      return next;
    }, setFolders);
    await commitCollection<Sample>(KEYS.samples, (prev) => {
      const next = prev.map((s) => s.folderId === id ? { ...s, folderId: null, updatedAt: new Date().toISOString() } : s);
      return next;
    }, setSamples);
  }, []);

  // Measurements
  const addMeasurement = useCallback(async (data: Omit<StrikeDipMeasurement, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const m: StrikeDipMeasurement = { ...data, id: uid(), createdAt: now, updatedAt: now };
    await commitCollection<StrikeDipMeasurement>(KEYS.measurements, (prev) => {
      const next = [m, ...prev];
      return next;
    }, setMeasurements);
    return m;
  }, []);

  const deleteMeasurement = useCallback(async (id: string) => {
    await archiveDeletion("measurement", id, await load<StrikeDipMeasurement>(KEYS.measurements));
    await commitCollection<StrikeDipMeasurement>(KEYS.measurements, (prev) => {
      const next = prev.filter((m) => m.id !== id);
      return next;
    }, setMeasurements);
  }, []);

  // Strat columns
  const addColumn = useCallback(async (name: string, description = "") => {
    const c: StratColumn = { id: uid(), name, description, layers: [], createdAt: new Date().toISOString() };
    await commitCollection<StratColumn>(KEYS.columns, (prev) => {
      const next = [c, ...prev];
      return next;
    }, setColumns);
    return c;
  }, []);

  const updateColumn = useCallback(async (id: string, updates: Partial<StratColumn>) => {
    await commitCollection<StratColumn>(KEYS.columns, (prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, ...updates } : c);
      return next;
    }, setColumns);
  }, []);

  const deleteColumn = useCallback(async (id: string) => {
    await commitCollection<StratColumn>(KEYS.columns, (prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next;
    }, setColumns);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncLock.current) return { uploaded: 0, downloaded: 0 };
    syncLock.current = true;
    setIsSyncing(true);
    let uploaded = 0;
    try {
      const account = (await getCurrentAuthUser()).user;
      if (!account) throw new Error("Sign in before syncing.");
      await requireFieldNoteAccount(String(account.id));
      const owner = await AsyncStorage.getItem("geofield_mobile_data_owner");
      if (owner && owner !== String(account.id)) throw new Error("These local records belong to a different account. Sign into the original account to sync them.");
      if (!owner) await AsyncStorage.setItem("geofield_mobile_data_owner", String(account.id));
      const deleted = await load<any>("geofield_deleted_records");
      const isDeleted = (kind: string, id: string) => deleted.some((item) => item.kind === kind && item.record.id === id);
      const [remoteFolders, remoteSamples, remoteMeasurements] = await Promise.all([getCloudFolders(true), getCloudSamples(undefined, undefined, true), getCloudMeasurements(true)]);
      for (const item of deleted) {
        await requireFieldNoteAccount(String(account.id));
        const id = item.record.id;
        if (item.kind === "sample" && remoteSamples.some((sample) => String(sample.id) === id)) await deleteCloudSample({ id, accountId: String(account.id) });
        if (item.kind === "folder" && remoteFolders.some((folder) => String(folder.id) === id)) await deleteCloudFolder({ id, accountId: String(account.id) });
        const measurement = remoteMeasurements.find((record) => record.id === id);
        if (item.kind === "measurement" && measurement) await updateCloudMeasurement({ ...measurement, deletedAt: item.deletedAt }, String(account.id));
      }
      const remoteFolderIds = new Set(remoteFolders.map((folder) => String(folder.id)));
      for (const folder of folders) {
        await requireFieldNoteAccount(String(account.id));
        if (!remoteFolderIds.has(folder.id)) {
          await createCloudFolder({ id: folder.id, accountId: String(account.id), data: { name: folder.name, description: folder.description } });
          uploaded += 1;
        }
      }

      const remoteById = new Map(remoteSamples.map((sample) => [String(sample.id), sample]));
      const syncedLocals: Sample[] = [];
      for (const sample of samples) {
        await requireFieldNoteAccount(String(account.id));
        const remote = remoteById.get(sample.id);
        if ((remote as any)?.deletedAt) { syncedLocals.push(sample); continue; }
        if (remote && Date.parse(remote.updatedAt) >= Date.parse(sample.updatedAt)) {
          syncedLocals.push(sample);
          continue;
        }

        const existingMedia = sample.media ?? [];
        const media = [] as NonNullable<Sample["media"]>;
        for (let index = 0; index < sample.photos.length; index += 1) {
          const uri = sample.photos[index];
          const prior = existingMedia.find((item) => item.localUri === uri || item.cloudUrl === uri);
          if (prior?.storageKey) {
            media.push(prior);
            continue;
          }
          const kind = /\.(mp4|mov|m4v|webm|3gp)(\?|#|$)/i.test(uri) ? "video" : "photo";
          const extension = uri.split(/[?#]/)[0].split(".").pop() || (kind === "video" ? "mp4" : "jpg");
          const mimeType = kind === "video" ? `video/${extension === "mov" ? "quicktime" : extension}` : `image/${extension === "jpg" ? "jpeg" : extension}`;
          const uploadedMedia = await uploadSampleMedia({ sampleId: sample.id, localUri: uri, fileName: `${kind}-${index}.${extension}`, mimeType, expectedAccountId: String(account.id) });
          media.push({ ...uploadedMedia, localUri: uri, kind, fileName: `${kind}-${index}.${extension}`, mimeType });
        }
        const fields = {
          ...sample.cloudFields,
          ...sample.fields,
          location: sample.location ? `${sample.location.lat.toFixed(7)}, ${sample.location.lon.toFixed(7)}` : undefined,
          altitude: sample.location?.altitude ?? undefined,
          elevation: sample.location?.altitude ?? null,
          elevationAccuracy: sample.location?.altitudeAccuracy ?? null,
          media: media.map((item) => ({ ...item, type: item.kind, syncStatus: "synced" })),
          photoCount: media.filter((item) => item.kind === "photo").length,
          videoCount: media.filter((item) => item.kind === "video").length,
        };
        const data = { sampleId: sample.sampleId, sampleType: sample.sampleType, folderId: sample.folderId, notes: sample.notes, fields };
        if (remote) await updateCloudSample({ id: sample.id, data, accountId: String(account.id) });
        else {
          try {
            await createCloudSample({ id: sample.id, data, accountId: String(account.id) });
          } catch (error) {
            await getCloudSample(sample.id, String(account.id)).catch(() => { throw error; });
            await updateCloudSample({ id: sample.id, data, accountId: String(account.id) });
          }
        }
        syncedLocals.push({ ...sample, media });
        uploaded += 1;
      }

      const freshRemote = await getCloudSamples(undefined, undefined, true);
      const localById = new Map(syncedLocals.map((sample) => [sample.id, sample]));
      const merged = [...syncedLocals];
      for (const cloud of freshRemote) {
        if (isDeleted("sample", String(cloud.id))) continue;
        const local = localById.get(String(cloud.id));
        if ((cloud as any).deletedAt) {
          if (local) await archiveDeletion("sample", local.id, [local]);
          const position = merged.findIndex((item) => item.id === String(cloud.id));
          if (position >= 0) merged.splice(position, 1);
          continue;
        }
        if (local && Date.parse(local.updatedAt) > Date.parse(cloud.updatedAt)) continue;
        const cloudFields = (cloud.fields ?? {}) as any;
        const cloudMedia = Array.isArray(cloudFields.media) ? cloudFields.media : [];
        const mapped: Sample = {
          id: String(cloud.id), sampleId: cloud.sampleId, sampleType: cloud.sampleType as SampleType,
          cloudFields,
          folderId: cloud.folderId == null ? null : String(cloud.folderId), notes: cloud.notes ?? "",
          fields: Object.fromEntries(Object.entries(cloudFields).filter(([key, value]) => key !== "media" && key !== "location" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).map(([key, value]) => [key, String(value)])) as Record<string, string>,
          location: (() => {
            const match = typeof cloudFields.location === "string" ? cloudFields.location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/) : null;
            const height = cloudFields.elevation ?? cloudFields.altitude;
            return match ? { lat: Number(match[1]), lon: Number(match[2]), altitude: typeof height === "number" && Number.isFinite(height) ? height : null, altitudeAccuracy: cloudFields.elevationAccuracy ?? null } : null;
          })(),
          photos: cloudMedia.map((item: any) => item.cloudUrl || item.dataUrl).filter(Boolean),
          media: cloudMedia.map((item: any) => ({ ...item, kind: item.kind || item.type })),
          createdAt: cloud.createdAt, updatedAt: cloud.updatedAt,
        };
        const position = merged.findIndex((item) => item.id === mapped.id);
        if (position >= 0) merged[position] = mapped;
        else merged.unshift(mapped);
      }
      const mergedFolders = [...folders];
      for (const cloud of await getCloudFolders(true)) {
        if ((cloud as any).deletedAt) {
          const position = mergedFolders.findIndex((item) => item.id === String(cloud.id));
          if (position >= 0) { await archiveDeletion("folder", String(cloud.id), mergedFolders); mergedFolders.splice(position, 1); }
          continue;
        }
        if (isDeleted("folder", String(cloud.id))) continue;
        if (!mergedFolders.some((folder) => folder.id === String(cloud.id))) {
          mergedFolders.push({ id: String(cloud.id), name: cloud.name, description: cloud.description ?? "", createdAt: cloud.createdAt });
        }
      }
      const remoteMeasurementsById = new Map(remoteMeasurements.map((item) => [item.id, item]));
      for (const measurement of measurements) {
        await requireFieldNoteAccount(String(account.id));
        const remote = remoteMeasurementsById.get(measurement.id);
        if (remote?.deletedAt) continue;
        const data = {
          ...measurement,
          strikeDegrees: measurement.strikeDegrees ?? Number.parseFloat(measurement.strike),
          dipDegrees: measurement.dipDegrees ?? Number.parseFloat(measurement.dip),
          dipDirectionDegrees: measurement.dipDirectionDegrees ?? Number.parseFloat(measurement.dipDir),
          convention: "right-hand-rule", northReference: "magnetic", quality: "manual",
        } as any;
        if (!remote) {
          await createCloudMeasurement(data, String(account.id));
          uploaded += 1;
        } else if (Date.parse(measurement.updatedAt) > Date.parse(remote.updatedAt)) {
          await updateCloudMeasurement(data, String(account.id));
          uploaded += 1;
        }
      }
      const freshMeasurements = await getCloudMeasurements(true);
      const mergedMeasurements = [...measurements];
      for (const cloud of freshMeasurements) {
        if (cloud.deletedAt) {
          const position = mergedMeasurements.findIndex((item) => item.id === cloud.id);
          if (position >= 0) { await archiveDeletion("measurement", cloud.id, mergedMeasurements); mergedMeasurements.splice(position, 1); }
          continue;
        }
        if (isDeleted("measurement", cloud.id)) continue;
        const mapped: StrikeDipMeasurement = {
          elevation: cloud.elevation, elevationAccuracy: cloud.elevationAccuracy,
          id: cloud.id, datasetId: cloud.datasetId ?? null, label: cloud.label, strike: cloud.strike,
          dip: cloud.dip, dipDir: cloud.dipDir, strikeDegrees: cloud.strikeDegrees,
          dipDegrees: cloud.dipDegrees, dipDirectionDegrees: cloud.dipDirectionDegrees,
          measurementType: cloud.measurementType, trendDegrees: cloud.trendDegrees,
          plungeDegrees: cloud.plungeDegrees, lineVector: cloud.lineVector as any,
          featureType: cloud.featureType, location: cloud.location, date: cloud.date, notes: cloud.notes,
          createdAt: cloud.createdAt, updatedAt: cloud.updatedAt,
        };
        const position = mergedMeasurements.findIndex((item) => item.id === mapped.id);
        if (position < 0) mergedMeasurements.unshift(mapped);
        else if (Date.parse(mapped.updatedAt) >= Date.parse(mergedMeasurements[position].updatedAt)) mergedMeasurements[position] = mapped;
      }
      await requireFieldNoteAccount(String(account.id));
      await commitCollection<Sample>(KEYS.samples, (current) => retainConcurrentEdits(current, samples, merged), setSamples);
      await commitCollection<Folder>(KEYS.folders, (current) => retainConcurrentEdits(current, folders, mergedFolders), setFolders);
      await commitCollection<StrikeDipMeasurement>(KEYS.measurements, (current) => retainConcurrentEdits(current, measurements, mergedMeasurements), setMeasurements);
      const syncedAt = new Date().toISOString();
      await AsyncStorage.setItem("geofield_last_synced_at", syncedAt);
      setLastSyncedAt(syncedAt);
      return { uploaded, downloaded: freshRemote.length + freshMeasurements.length };
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
    }
  }, [folders, isSyncing, measurements, samples]);

  return (
    <DataContext.Provider value={{
      samples, addSample, updateSample, deleteSample,
      folders, addFolder, updateFolder, deleteFolder,
      measurements, addMeasurement, deleteMeasurement,
      columns, addColumn, updateColumn, deleteColumn,
      isLoaded, isSyncing, lastSyncedAt, syncNow,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
