import { orderMeasurements } from "@/lib/measurement-order";
import { getStoredMediaDataUrl, storeMediaDataUrl } from "@/lib/media-storage";
import { stampMeasurementAtSave, toLocalDateTimeInputValue } from "@/lib/measurement-save-time";
import { elevationFromCoordinates, formatElevation } from "@/lib/elevation";
import { resolveDatasetId } from "@/lib/dataset-identity";
import { useState, useEffect, useMemo, useRef } from "react";
import { useGetCurrentAuthUser, useGetFolders } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompassModal, type StrikeDipCapture } from "@/components/CompassModal";
import { ExportCustomizerDialog } from "@/components/ExportCustomizerDialog";
import { FolderDialog } from "@/components/FolderDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Compass, ChevronUp, Download, X, Camera, Image as ImageIcon, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { saveFile } from "@/lib/save-file";
import {
  STRIKE_DIP_COLUMNS, buildStyledWorksheet,
  loadExportConfig, loadColumnPrefs,
  strikeDipToDataRow,
  type ExportColumn, type ExportFormatConfig,
} from "@/lib/export-config";
import { format as fmtDate } from "date-fns";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import { deleteMeasurement, loadMeasurements, saveMeasurements, STRIKE_DIP_UPDATED_EVENT, type StrikeDipMeasurement } from "@/lib/strike-dip-measurements";
import { getStorageAccountId } from "@/lib/storage-account";
import { SavePhotoButton } from "@/components/SavePhotoButton";
import { requireAccountForSave } from "@/lib/guest-access";

function deriveDipDir(strikeStr: string): string {
  const n = parseFloat(strikeStr);
  if (isNaN(n)) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((n + 90) % 360) / 22.5) % 16];
}

function normalizeAngle(value: string, maximum: number): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return String(Math.min(maximum, Math.max(0, number)));
}

function normalizeStrike(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(((Math.round(number) % 360) + 360) % 360) : "";
}

function blankMeasurement(datasetId?: number | string | null): StrikeDipMeasurement {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    label: "",
    strike: "",
    dip: "",
    dipDir: "",
    location: "",
    date: toLocalDateTimeInputValue(),
    featureType: "",
    rockLayerType: "",
    datasetId: datasetId ?? null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const ROCK_LAYER_OPTIONS = [
  "Sandstone bed",
  "Siltstone bed",
  "Shale layer",
  "Limestone bed",
  "Dolostone bed",
  "Conglomerate bed",
  "Basalt flow",
  "Intrusive contact",
  "Metamorphic foliation layer",
  "Ore / mineralized zone",
  "Soil / regolith layer",
  "Other layer",
];

/* ── Row component ──────────────────────────────────────────────────────── */
function MeasurementRow({
  measurement, index, allFolders, initiallyOpen = false, onChange, onDelete,
}: {
  measurement: StrikeDipMeasurement;
  index: number;
  allFolders: Array<{ id: number | string; name: string; isLocal?: boolean }>;
  initiallyOpen?: boolean;
  onChange: (m: StrikeDipMeasurement) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [photoUrl, setPhotoUrl] = useState(measurement.photo);
  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(measurement.photo);
    if (measurement.photoLocalKey) void getStoredMediaDataUrl(measurement.photoLocalKey).then((url) => { if (!cancelled) setPhotoUrl(url ?? undefined); }).catch(() => {});
    return () => { cancelled = true; };
  }, [measurement.photo, measurement.photoLocalKey]);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!initiallyOpen) return;
    setOpen(true);
    rowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [initiallyOpen]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const upd = (k: keyof StrikeDipMeasurement, v: string) => {
    if (k === "strike") {
      const cleanStrike = v.replace(/[^0-9.]/g, "");
      const numeric = Number(cleanStrike);
      const direction = Number.isFinite(numeric) ? ((numeric + 90) % 360) : undefined;
      onChange({ ...measurement, strike: cleanStrike, strikeDegrees: numeric, dipDirectionDegrees: direction, dipDir: direction === undefined ? "" : `${Math.round(direction).toString().padStart(3, "0")}° ${deriveDipDir(cleanStrike)}`, convention: "right-hand-rule" });
      return;
    }
    if (k === "dip") {
      onChange({ ...measurement, dip: v.replace(/[^0-9.]/g, "") });
      return;
    }
    onChange({ ...measurement, [k]: v });
  };
  const setDatasetId = (value: string) => onChange({ ...measurement, datasetId: value ? value : null });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const accountId = getStorageAccountId();
      const dataUrl = await compressImage(file);
      const stored = await storeMediaDataUrl({ kind: "photo", dataUrl, fileName: file.name, mimeType: "image/jpeg" });
      if (!accountId || getStorageAccountId() !== accountId) return;
      const latest = loadMeasurements().find((item) => item.id === measurement.id);
      if (latest) onChange({ ...latest, photo: undefined, photoKey: null, photoLocalKey: stored.storageKey, photoUploadId: crypto.randomUUID() });
    } catch {}
  };

  return (
    <div ref={rowRef} className="rounded-2xl border border-border/80 border-l-[3px] border-l-primary/50 bg-card shadow-sm overflow-hidden scroll-mt-4">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-primary/5 to-transparent px-4 py-4">
        {/* Photo thumbnail or index badge */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt="outcrop"
            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border cursor-pointer"
            onClick={() => setOpen((o) => !o)}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {index + 1}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{measurement.measurementType === "lineation" ? "Lineation" : "Strike & Dip"}</p>
          <p className="text-sm font-semibold truncate">{measurement.label || "Untitled measurement"}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold font-mono text-primary">
              {measurement.measurementType === "lineation"
                ? `Azimuth ${measurement.trendDegrees?.toFixed(0).padStart(3, "0") ?? "--"}° / Plunge ${measurement.plungeDegrees ?? "--"}°`
                : `Strike ${measurement.strike || "--"} / Dip ${measurement.dip || "--"}`}
            </span>
            {measurement.featureType && (
              <span className="text-xs text-muted-foreground">{measurement.featureType}</span>
            )}
            {measurement.rockLayerType && (
              <span className="text-xs text-muted-foreground">{measurement.rockLayerType}</span>
            )}
          </div>
        </div>

        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-expanded={open}>
          {open ? <><ChevronUp className="w-4 h-4" />Done</> : <><Pencil className="w-4 h-4" />Edit</>}
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded editor */}
      {open && (
        <div className="px-4 pb-4 pt-4 border-t border-primary/10 bg-muted/20 space-y-4">
          {/* Photo slot */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground/80">Outcrop / Field Photo</Label>
            {!photoUrl && measurement.photoKey && <p className="text-xs text-muted-foreground">Photo saved to your account. Sync when connected to download it here.</p>}
            {photoUrl ? (
              <div className="relative inline-block">
                <img
                  src={photoUrl}
                  alt="outcrop"
                  className="w-full max-w-xs h-40 object-cover rounded-xl border border-border shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...measurement, photo: undefined, photoKey: null, photoLocalKey: undefined, photoUploadId: undefined })}
                  className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <SavePhotoButton
                  src={photoUrl}
                  fileName={`geofield-${measurement.label || `strike-dip-${index + 1}`}`}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  className="flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  Choose from Library
                </button>
              </div>
            )}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <h3 className="flex items-center gap-2 border-b border-primary/15 pb-2 text-sm font-semibold text-primary"><Compass className="h-4 w-4" aria-hidden="true" />{measurement.measurementType === "lineation" ? "Lineation Measurement" : "Strike & Dip Measurement"}</h3>
          {/* Fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Label / Name</Label>
              <Input autoFocus={initiallyOpen} value={measurement.label} onChange={(e) => upd("label", e.target.value)} placeholder={measurement.measurementType === "lineation" ? "e.g. Outcrop A — mineral lineation" : "e.g. Outcrop A — bedding plane"} className="h-9 text-sm" />
            </div>
            {measurement.measurementType === "lineation" ? <>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Azimuth</Label><Input type="text" inputMode="numeric" value={measurement.trendDegrees ?? ""} onChange={(e) => onChange({ ...measurement, trendDegrees: Number(e.target.value) })} placeholder="0–359°" className="h-10 bg-card text-base font-semibold font-mono" aria-label="Azimuth in degrees" /></div>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Plunge</Label><Input type="text" inputMode="decimal" value={measurement.plungeDegrees ?? ""} onChange={(e) => onChange({ ...measurement, plungeDegrees: Number(e.target.value) })} placeholder="0–90°" className="h-10 bg-card text-base font-semibold font-mono" aria-label="Plunge in degrees" /></div>
            </> : <>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Strike</Label><Input type="text" inputMode="numeric" value={measurement.strike} onChange={(e) => upd("strike", e.target.value)} onBlur={() => upd("strike", normalizeStrike(measurement.strike))} placeholder="0–359°" className="h-10 bg-card text-base font-semibold font-mono" aria-label="Strike in degrees" /></div>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Dip</Label><Input type="text" inputMode="decimal" value={measurement.dip} onChange={(e) => upd("dip", e.target.value)} onBlur={() => upd("dip", normalizeAngle(measurement.dip, 90))} placeholder="0–90°" className="h-10 bg-card text-base font-semibold font-mono" aria-label="Dip in degrees" /></div>
            </>}
            <div className="col-span-2 sm:col-span-3 flex items-center gap-2 pt-1"><span className="h-1.5 w-1.5 rounded-full bg-primary/60" /><h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Geology &amp; record details</h4></div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Feature Type</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                value={measurement.featureType}
                onChange={(e) => upd("featureType", e.target.value)}
              >
                <option value="">Select...</option>
                {measurement.measurementType === "lineation" ? <>
                  <option>Lineation</option><option>Mineral lineation</option><option>Stretching lineation</option><option>Slickenline</option><option>Intersection lineation</option><option>Fold axis</option>
                  {measurement.featureType && !["Lineation", "Mineral lineation", "Stretching lineation", "Slickenline", "Intersection lineation", "Fold axis", "Other"].includes(measurement.featureType) && <option>{measurement.featureType}</option>}
                </> : <><option>Bedding plane</option>
                <option>Fault plane</option>
                <option>Foliation</option>
                <option>Cleavage</option>
                <option>Joint / fracture</option>
                <option>Vein</option>
                <option>Contact</option>
                <option>Unconformity</option>
                {measurement.featureType && !["Bedding plane", "Fault plane", "Foliation", "Cleavage", "Joint / fracture", "Vein", "Contact", "Unconformity", "Other"].includes(measurement.featureType) && <option>{measurement.featureType}</option>}
                </>}
                <option>Other</option>
              </select>
              <Input
                  value={measurement.featureType ?? ""}
                  onChange={(e) => upd("featureType", e.target.value)}
                  placeholder={measurement.measurementType === "lineation" ? "Or type your own lineation feature type" : "Or type your own feature type"}
                  aria-label={measurement.measurementType === "lineation" ? "Custom lineation feature type" : "Custom strike and dip feature type"}
                  className="h-8 text-sm"
                />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Rock / Layer Type</Label>
              <div className="grid gap-1.5">
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  value={ROCK_LAYER_OPTIONS.includes(measurement.rockLayerType ?? "") ? measurement.rockLayerType : ""}
                  onChange={(e) => upd("rockLayerType", e.target.value)}
                >
                  <option value="">Select preset...</option>
                  {ROCK_LAYER_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <Input
                  value={measurement.rockLayerType ?? ""}
                  onChange={(e) => upd("rockLayerType", e.target.value)}
                  placeholder="Or type your own rock/layer type"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Dataset</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                value={measurement.datasetId ?? ""}
                onChange={(e) => setDatasetId(e.target.value)}
              >
                <option value="">Uncategorized</option>
                {allFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}{folder.isLocal ? " (local)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Date &amp; Time</Label>
              <Input type="datetime-local" value={measurement.date} onChange={(e) => upd("date", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Elevation (GPS)</Label>
              <p className="text-sm">{formatElevation(measurement.elevation, measurement.elevationAccuracy)}</p>
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Notes</Label>
              <Input value={measurement.notes} onChange={(e) => upd("notes", e.target.value)} placeholder="Fold vergence, shear sense, quality of measurement…" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex justify-end border-t border-border/70 pt-3">
            <Button type="button" size="sm" onClick={() => setOpen(false)}>Done Editing</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
function latitudeBand(lat: number): string {
  if (lat < -80 || lat > 84) return lat >= 0 ? "N" : "S";
  const bands = "CDEFGHJKLMNPQRSTUVWX";
  return bands[Math.min(19, Math.floor((lat + 80) / 8))];
}

function latLonToUTM(lat: number, lon: number) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const eSq = e * e;
  const ePrimeSq = eSq / (1 - eSq);

  const zoneNumber = Math.floor((lon + 180) / 6) + 1;
  const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lonOriginRad = (lonOrigin * Math.PI) / 180;

  const n = a / Math.sqrt(1 - eSq * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = ePrimeSq * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const m =
    a *
    ((1 - eSq / 4 - (3 * eSq ** 2) / 64 - (5 * eSq ** 3) / 256) * latRad -
      ((3 * eSq) / 8 + (3 * eSq ** 2) / 32 + (45 * eSq ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * eSq ** 2) / 256 + (45 * eSq ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * eSq ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    k0 *
      n *
      (A +
        ((1 - t + c) * A ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * ePrimeSq) * A ** 5) / 120) +
    500000;

  let northing =
    k0 *
    (m +
      n *
        Math.tan(latRad) *
        ((A ** 2) / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * A ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * ePrimeSq) * A ** 6) / 720));

  if (lat < 0) northing += 10000000;

  return {
    utmZone: `${zoneNumber}${latitudeBand(lat)}`,
    utmEasting: Math.round(easting),
    utmNorthing: Math.round(northing),
  };
}

function addGpsToMeasurement(measurement: StrikeDipMeasurement, position: GeolocationPosition): StrikeDipMeasurement {
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;

  return {
    ...measurement,
    latitude,
    longitude,
    gpsAccuracy: position.coords.accuracy,
    ...elevationFromCoordinates(position.coords),
    ...latLonToUTM(latitude, longitude),
    location: measurement.location || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
}

export default function StrikeDipPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: authData } = useGetCurrentAuthUser();
  const [measurements, setMeasurements] = useState<StrikeDipMeasurement[]>(loadMeasurements);
  const [compassOpen, setCompassOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<StrikeDipMeasurement>(() => blankMeasurement(null));
  const [selectedDatasetId, setSelectedDatasetId] = useState<"all" | "uncategorized" | string>("all");
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const { data: folders } = useGetFolders();
  const allFolders = useMemo(
    () => [...(folders || []), ...getVisibleLocalDatasets(localDatasets, folders)],
    [folders, localDatasets],
  );
  useEffect(() => {
    setSelectedDatasetId((id) => String(resolveDatasetId(id, localDatasets)));
  }, [localDatasets]);
  const visibleMeasurements = useMemo(() => {
    const ordered = orderMeasurements(measurements);
    if (selectedDatasetId === "all") return ordered;
    if (selectedDatasetId === "uncategorized") return ordered.filter((m) => !m.datasetId);
    return ordered.filter((m) => String(resolveDatasetId(m.datasetId, localDatasets) ?? "") === String(resolveDatasetId(selectedDatasetId, localDatasets)));
  }, [measurements, selectedDatasetId, localDatasets]);
  const selectedDatasetName = selectedDatasetId === "all"
    ? "All Datasets"
    : selectedDatasetId === "uncategorized"
      ? "Uncategorized"
      : allFolders.find((folder: any) => String(folder.id) === selectedDatasetId)?.name || "Dataset";

  // Persist user changes immediately against current storage. Writing a whole
  // React snapshot in an effect could overwrite a concurrent sync or lose an
  // assignment when navigating away before the effect ran.
  const changeMeasurements = (update: (current: StrikeDipMeasurement[]) => StrikeDipMeasurement[]) => {
    saveMeasurements(update(loadMeasurements()));
    setMeasurements(loadMeasurements());
  };

  useEffect(() => {
    const refreshFromSync = () => {
      const next = loadMeasurements();
      setMeasurements((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, refreshFromSync);
    window.addEventListener("storage", refreshFromSync);
    return () => {
      window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, refreshFromSync);
      window.removeEventListener("storage", refreshFromSync);
    };
  }, []);

  useEffect(() => {
    if (!newlyCreatedId) return;
    const timer = window.setTimeout(() => setNewlyCreatedId(null), 0);
    return () => window.clearTimeout(timer);
  }, [newlyCreatedId]);

  useEffect(() => {
    const refreshDatasets = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
    window.addEventListener("storage", refreshDatasets);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
      window.removeEventListener("storage", refreshDatasets);
    };
  }, []);

  const addMeasurementWithGps = (measurement: StrikeDipMeasurement, successTitle?: string, successDescription?: string) => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return;
    const savingAccountId = getStorageAccountId();
    measurement = stampMeasurementAtSave(measurement);
    // Save and open the details now; a GPS fix can take ten seconds in the field.
    changeMeasurements((prev) => [...prev, measurement]);
    setNewlyCreatedId(measurement.id);
    if (successTitle) toast({ title: successTitle, description: successDescription });
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!savingAccountId || getStorageAccountId() !== savingAccountId) return;
        // Merge into the latest saved record so typing, photos, dataset changes,
        // or deletion while GPS is pending cannot be overwritten or resurrected.
        changeMeasurements((current) => current.map((item) => {
          if (item.id !== measurement.id || item.location !== measurement.location ||
              item.latitude !== measurement.latitude || item.longitude !== measurement.longitude) return item;
          return {
            ...addGpsToMeasurement(item, position),
            updatedAt: new Date(Math.max(Date.now(), (Date.parse(item.updatedAt ?? "") || 0) + 1)).toISOString(),
          };
        }));
      },
      () => { /* The measurement is already saved and its details remain open. */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const addManual = () => {
    setManualDraft(blankMeasurement(selectedDatasetId === "all" || selectedDatasetId === "uncategorized" ? null : selectedDatasetId));
    setManualOpen(true);
  };

  const saveManualMeasurement = () => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return;
    const strike = normalizeStrike(manualDraft.strike);
    const dip = normalizeAngle(manualDraft.dip, 90);
    if (!strike || !dip) {
      toast({ title: "Strike and dip required", description: "Enter a strike from 0–359° and a dip from 0–90°.", variant: "destructive" });
      return;
    }
    const strikeDegrees = Number(strike);
    const dipDegrees = Number(dip);
    const dipDirectionDegrees = ((strikeDegrees + 90) % 360);
    const measurement: StrikeDipMeasurement = { ...manualDraft, strike, dip, strikeDegrees, dipDegrees, dipDirectionDegrees, dipDir: `${dipDirectionDegrees.toString().padStart(3, "0")}° ${deriveDipDir(strike)}`, convention: "right-hand-rule", northReference: "magnetic", quality: "manual", updatedAt: new Date().toISOString() };
    addMeasurementWithGps(measurement, "Measurement saved", `Strike ${strike}° / Dip ${dip}°`);
    setManualOpen(false);
  };

  const updateMeasurementById = (id: string, m: StrikeDipMeasurement) => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return;
    changeMeasurements((prev) => prev.map((item) => item.id === id ? { ...m, updatedAt: new Date().toISOString() } : item));
  };

  const deleteMeasurementById = (id: string) => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return;
    const measurement = measurements.find((item) => item.id === id);
    if (!measurement || !confirm(`Delete "${measurement.label || "this measurement"}"? You can restore it from Settings.`)) return;
    deleteMeasurement(id);
    setMeasurements(loadMeasurements());
  };

  const openExport = () => {
    if (visibleMeasurements.length === 0) {
      toast({ title: "Nothing to export", description: "Add at least one measurement first.", variant: "destructive" });
      return;
    }
    setExportOpen(true);
  };

  const handleDoExport = async (columns: ExportColumn[], config: ExportFormatConfig, fileName: string) => {
    const dataRows = visibleMeasurements.map((m, i) => strikeDipToDataRow(
      m,
      i,
      m.datasetId
        ? allFolders.find((folder: any) => String(folder.id) === String(m.datasetId))?.name || "Unknown Dataset"
        : "Uncategorized",
    ));
    const ws = buildStyledWorksheet(columns, dataRows, config);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.sheetName || "Strike & Dip");
    const output = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const result = await saveFile(
      new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${fileName}_${fmtDate(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
      { previewAfterSave: true },
    );
    toast({ title: result === "shared" ? "Export ready" : "Exported", description: `${visibleMeasurements.length} measurements prepared for Excel (photos not included).` });
  };

  const clearAll = () => {
    if (!confirm(`Delete all ${measurements.length} measurements? You can restore them from Settings.`)) return;
    measurements.forEach((measurement) => deleteMeasurement(measurement.id));
    setMeasurements(loadMeasurements());
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Compass className="w-6 h-6 text-primary" />
              Strike &amp; Dip
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {visibleMeasurements.length} of {measurements.length} measurement{measurements.length !== 1 ? "s" : ""} shown
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {measurements.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={openExport} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Export Excel
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll} className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5">
                  <X className="w-3.5 h-3.5" />
                  Clear all
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Dataset filter */}
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Dataset
          </Label>
          <select
            className="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
          >
            <option value="all">All Datasets</option>
            {allFolders.map((folder: any) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}{folder.isLocal ? " (local)" : ""}
              </option>
            ))}
            <option value="uncategorized">Uncategorized</option>
          </select>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setFolderDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New
          </Button>
        </div>

        {/* Add buttons */}
        <div className="flex gap-3">
          <Button onClick={() => setCompassOpen(true)} className="flex-1 gap-2">
            <Compass className="w-4 h-4" />
            Use Compass
          </Button>
          <Button variant="outline" onClick={addManual} className="flex-1 gap-2">
            <Plus className="w-4 h-4" />
            Enter Manually
          </Button>
        </div>

        {/* Measurement list */}
        {visibleMeasurements.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Compass className="w-10 h-10 opacity-30" />
            </div>
            <div className="text-center">
              <p className="font-medium">{measurements.length === 0 ? "No measurements yet" : "No measurements in this dataset"}</p>
              <p className="text-sm mt-1">
                {measurements.length === 0
                  ? "Use the compass button to capture a reading from your phone, or enter strike and dip values manually."
                  : "Choose another dataset or assign measurements to this dataset from each row."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMeasurements.map((m, idx) => (
              <MeasurementRow
                key={m.id}
                measurement={m}
                index={idx}
                allFolders={allFolders}
                initiallyOpen={m.id === newlyCreatedId}
                onChange={(updated) => updateMeasurementById(m.id, updated)}
                onDelete={() => deleteMeasurementById(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CompassModal
        open={compassOpen}
        onClose={() => setCompassOpen(false)}
        onCapture={(capture: StrikeDipCapture) => {
          if (capture.measurementType === "lineation") {
            const m: StrikeDipMeasurement = {
              ...blankMeasurement(selectedDatasetId === "all" || selectedDatasetId === "uncategorized" ? null : selectedDatasetId),
              ...capture,
              measurementType: "lineation",
              label: "Lineation",
              featureType: "Lineation",
            };
            addMeasurementWithGps(m, "Lineation captured", `Azimuth ${capture.trendDegrees}° / Plunge ${capture.plungeDegrees}°`);
            return;
          }
          const m: StrikeDipMeasurement = {
            ...blankMeasurement(selectedDatasetId === "all" || selectedDatasetId === "uncategorized" ? null : selectedDatasetId),
            ...capture,
            measurementType: "plane",
            strike: String(capture.strikeDegrees),
            dip: String(capture.dipDegrees),
            dipDir: `${capture.dipDirectionDegrees.toString().padStart(3, "0")}° ${deriveDipDir(String(capture.strikeDegrees))}`,
          };
          addMeasurementWithGps(m, "Measurement captured", `Strike ${m.strike}° / Dip ${m.dip}°`);
        }}
      />

      <Dialog open={manualOpen} onOpenChange={setManualOpen} panelClassName="max-w-xl">
        <DialogHeader>
          <DialogTitle>Enter Strike &amp; Dip Manually</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="manual-strike">Strike (0–359°)</Label>
              <Input id="manual-strike" autoFocus inputMode="numeric" value={manualDraft.strike} onChange={(e) => { const strike = e.target.value.replace(/[^0-9]/g, ""); const direction = strike ? (Number(strike) + 90) % 360 : undefined; setManualDraft((draft) => ({ ...draft, strike, strikeDegrees: strike ? Number(strike) : undefined, dipDirectionDegrees: direction, dipDir: direction === undefined ? "" : String(direction) })); }} onBlur={() => setManualDraft((draft) => ({ ...draft, strike: normalizeStrike(draft.strike) }))} placeholder="045" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-dip">Dip (0–90°)</Label>
              <Input id="manual-dip" inputMode="decimal" value={manualDraft.dip} onChange={(e) => setManualDraft((draft) => ({ ...draft, dip: e.target.value.replace(/[^0-9.]/g, "") }))} placeholder="30" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-label">Label / Name</Label>
            <Input id="manual-label" value={manualDraft.label} onChange={(e) => setManualDraft((draft) => ({ ...draft, label: e.target.value }))} placeholder="Outcrop A — bedding plane" />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="manual-feature">Feature Type</Label>
              <select id="manual-feature" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={manualDraft.featureType} onChange={(e) => setManualDraft((draft) => ({ ...draft, featureType: e.target.value }))}>
                <option value="">Select…</option><option>Bedding plane</option><option>Fault plane</option><option>Foliation</option><option>Cleavage</option><option>Joint / fracture</option><option>Other</option>
                {manualDraft.featureType && !["Bedding plane", "Fault plane", "Foliation", "Cleavage", "Joint / fracture", "Other"].includes(manualDraft.featureType) && <option>{manualDraft.featureType}</option>}
              </select>
              <Input value={manualDraft.featureType ?? ""} onChange={(e) => setManualDraft((draft) => ({ ...draft, featureType: e.target.value }))} placeholder="Or type your own feature type" aria-label="Custom strike and dip feature type" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button type="button" onClick={saveManualMeasurement}>Save Measurement</Button>
          </div>
        </DialogContent>
      </Dialog>

      <FolderDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} />

      <ExportCustomizerDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Customize Strike & Dip Export"
        subtitle={`${visibleMeasurements.length} measurement${visibleMeasurements.length !== 1 ? "s" : ""} from "${selectedDatasetName}" · photos not included`}
        initialColumns={loadColumnPrefs("strikedip", STRIKE_DIP_COLUMNS)}
        initialConfig={loadExportConfig("strikedip")}
        configKey="strikedip"
        exportLabel={`Export ${visibleMeasurements.length} measurement${visibleMeasurements.length !== 1 ? "s" : ""}`}
        initialFileName="strike_dip"
        onExport={handleDoExport}
      />
    </Layout>
  );
}
