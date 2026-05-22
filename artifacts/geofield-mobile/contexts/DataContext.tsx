import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SampleType = "water" | "rock" | "soil_sand";

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
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [measurements, setMeasurements] = useState<StrikeDipMeasurement[]>([]);
  const [columns, setColumns] = useState<StratColumn[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      load<Sample>(KEYS.samples),
      load<Folder>(KEYS.folders),
      load<StrikeDipMeasurement>(KEYS.measurements),
      load<StratColumn>(KEYS.columns),
    ]).then(([s, f, m, c]) => {
      setSamples(s);
      setFolders(f);
      setMeasurements(m);
      setColumns(c);
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

  return (
    <DataContext.Provider value={{
      samples, addSample, updateSample, deleteSample,
      folders, addFolder, updateFolder, deleteFolder,
      measurements, addMeasurement, deleteMeasurement,
      columns, addColumn, updateColumn, deleteColumn,
      isLoaded,
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
