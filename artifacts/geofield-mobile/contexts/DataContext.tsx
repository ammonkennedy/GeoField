import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  createFolder as createCloudFolder,
  createSample as createCloudSample,
  getFolders as getCloudFolders,
  getSample as getCloudSample,
  getSamples as getCloudSamples,
  updateSample as updateCloudSample,
  uploadSampleMedia,
} from "@workspace/api-client-react";

export type SampleType = "water" | "rock" | "soil_sand" | "other";

export interface GeoLocation {
  lat: number;
  lon: number;
  altitude: number | null;
}

export interface Sample {
  id: string;
  sampleId: string;
  sampleType: SampleType;
  folderId: string | null;
  notes: string;
  fields: Record<string, string>;
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
  id: string;
  label: string;
  strike: string;
  dip: string;
  dipDir: string;
  featureType: string;
  location: string;
  date: string;
  notes: string;
  createdAt: string;
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
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function save<T>(key: string, data: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(data));
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
  addMeasurement: (m: Omit<StrikeDipMeasurement, "id" | "createdAt">) => Promise<StrikeDipMeasurement>;
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
      if (retainedSamples.length !== s.length) void save(KEYS.samples, retainedSamples);
      setSamples(retainedSamples);
      setFolders(f);
      setMeasurements(m);
      setColumns(c);
      setLastSyncedAt(lastSync);
      setIsLoaded(true);
    });
  }, []);

  // Samples
  const addSample = useCallback(async (data: Omit<Sample, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const s: Sample = { ...data, id: uid(), createdAt: now, updatedAt: now };
    setSamples((prev) => {
      const next = [s, ...prev];
      save(KEYS.samples, next);
      return next;
    });
    return s;
  }, []);

  const updateSample = useCallback(async (id: string, updates: Partial<Sample>) => {
    setSamples((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
      save(KEYS.samples, next);
      return next;
    });
  }, []);

  const deleteSample = useCallback(async (id: string) => {
    setSamples((prev) => {
      const next = prev.filter((s) => s.id !== id);
      save(KEYS.samples, next);
      return next;
    });
  }, []);

  // Folders
  const addFolder = useCallback(async (name: string, description = "") => {
    const f: Folder = { id: uid(), name, description, createdAt: new Date().toISOString() };
    setFolders((prev) => {
      const next = [...prev, f];
      save(KEYS.folders, next);
      return next;
    });
    return f;
  }, []);

  const updateFolder = useCallback(async (id: string, name: string, description = "") => {
    setFolders((prev) => {
      const next = prev.map((f) => f.id === id ? { ...f, name, description } : f);
      save(KEYS.folders, next);
      return next;
    });
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    setFolders((prev) => {
      const next = prev.filter((f) => f.id !== id);
      save(KEYS.folders, next);
      return next;
    });
    setSamples((prev) => {
      const next = prev.map((s) => s.folderId === id ? { ...s, folderId: null } : s);
      save(KEYS.samples, next);
      return next;
    });
  }, []);

  // Measurements
  const addMeasurement = useCallback(async (data: Omit<StrikeDipMeasurement, "id" | "createdAt">) => {
    const m: StrikeDipMeasurement = { ...data, id: uid(), createdAt: new Date().toISOString() };
    setMeasurements((prev) => {
      const next = [m, ...prev];
      save(KEYS.measurements, next);
      return next;
    });
    return m;
  }, []);

  const deleteMeasurement = useCallback(async (id: string) => {
    setMeasurements((prev) => {
      const next = prev.filter((m) => m.id !== id);
      save(KEYS.measurements, next);
      return next;
    });
  }, []);

  // Strat columns
  const addColumn = useCallback(async (name: string, description = "") => {
    const c: StratColumn = { id: uid(), name, description, layers: [], createdAt: new Date().toISOString() };
    setColumns((prev) => {
      const next = [c, ...prev];
      save(KEYS.columns, next);
      return next;
    });
    return c;
  }, []);

  const updateColumn = useCallback(async (id: string, updates: Partial<StratColumn>) => {
    setColumns((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, ...updates } : c);
      save(KEYS.columns, next);
      return next;
    });
  }, []);

  const deleteColumn = useCallback(async (id: string) => {
    setColumns((prev) => {
      const next = prev.filter((c) => c.id !== id);
      save(KEYS.columns, next);
      return next;
    });
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncing) return { uploaded: 0, downloaded: 0 };
    setIsSyncing(true);
    let uploaded = 0;
    try {
      const [remoteFolders, remoteSamples] = await Promise.all([getCloudFolders(), getCloudSamples()]);
      const remoteFolderIds = new Set(remoteFolders.map((folder) => String(folder.id)));
      for (const folder of folders) {
        if (!remoteFolderIds.has(folder.id)) {
          await createCloudFolder({ id: folder.id, data: { name: folder.name, description: folder.description } });
          uploaded += 1;
        }
      }

      const remoteById = new Map(remoteSamples.map((sample) => [String(sample.id), sample]));
      const syncedLocals: Sample[] = [];
      for (const sample of samples) {
        const remote = remoteById.get(sample.id);
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
          const uploadedMedia = await uploadSampleMedia({ sampleId: sample.id, localUri: uri, fileName: `${kind}-${index}.${extension}`, mimeType });
          media.push({ ...uploadedMedia, localUri: uri, kind, fileName: `${kind}-${index}.${extension}`, mimeType });
        }
        const fields = {
          ...sample.fields,
          location: sample.location ? `${sample.location.lat.toFixed(7)}, ${sample.location.lon.toFixed(7)}` : undefined,
          altitude: sample.location?.altitude ?? undefined,
          media: media.map((item) => ({ ...item, type: item.kind, syncStatus: "synced" })),
          photoCount: media.filter((item) => item.kind === "photo").length,
          videoCount: media.filter((item) => item.kind === "video").length,
        };
        const data = { sampleId: sample.sampleId, sampleType: sample.sampleType, folderId: sample.folderId, notes: sample.notes, fields };
        if (remote) await updateCloudSample({ id: sample.id, data });
        else {
          try {
            await createCloudSample({ id: sample.id, data });
          } catch (error) {
            await getCloudSample(sample.id).catch(() => { throw error; });
          }
        }
        syncedLocals.push({ ...sample, media });
        uploaded += 1;
      }

      const freshRemote = await getCloudSamples();
      const localById = new Map(syncedLocals.map((sample) => [sample.id, sample]));
      const merged = [...syncedLocals];
      for (const cloud of freshRemote) {
        const local = localById.get(String(cloud.id));
        if (local && Date.parse(local.updatedAt) > Date.parse(cloud.updatedAt)) continue;
        const cloudFields = (cloud.fields ?? {}) as any;
        const cloudMedia = Array.isArray(cloudFields.media) ? cloudFields.media : [];
        const mapped: Sample = {
          id: String(cloud.id), sampleId: cloud.sampleId, sampleType: cloud.sampleType as SampleType,
          folderId: cloud.folderId == null ? null : String(cloud.folderId), notes: cloud.notes ?? "",
          fields: Object.fromEntries(Object.entries(cloudFields).filter(([key, value]) => key !== "media" && key !== "location" && typeof value === "string")) as Record<string, string>,
          location: (() => {
            const match = typeof cloudFields.location === "string" ? cloudFields.location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/) : null;
            return match ? { lat: Number(match[1]), lon: Number(match[2]), altitude: Number.isFinite(Number(cloudFields.altitude)) ? Number(cloudFields.altitude) : null } : null;
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
      for (const cloud of await getCloudFolders()) {
        if (!mergedFolders.some((folder) => folder.id === String(cloud.id))) {
          mergedFolders.push({ id: String(cloud.id), name: cloud.name, description: cloud.description ?? "", createdAt: cloud.createdAt });
        }
      }
      await Promise.all([save(KEYS.samples, merged), save(KEYS.folders, mergedFolders)]);
      setSamples(merged);
      setFolders(mergedFolders);
      const syncedAt = new Date().toISOString();
      await AsyncStorage.setItem("geofield_last_synced_at", syncedAt);
      setLastSyncedAt(syncedAt);
      return { uploaded, downloaded: freshRemote.length };
    } finally {
      setIsSyncing(false);
    }
  }, [folders, isSyncing, samples]);

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
