import { useState, useEffect, useMemo, useRef } from "react";
import { useGetFolders } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompassModal, type StrikeDipCapture } from "@/components/CompassModal";
import { ExportCustomizerDialog } from "@/components/ExportCustomizerDialog";
import { FolderDialog } from "@/components/FolderDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Compass, ChevronUp, Download, X, Camera, Image as ImageIcon, MapPin, FolderOpen } from "lucide-react";
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
import { deleteMeasurement, loadMeasurements, saveMeasurements, type StrikeDipMeasurement } from "@/lib/strike-dip-measurements";

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

function toLocalDateTimeInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function blankMeasurement(datasetId?: number | string | null): StrikeDipMeasurement {
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

function formatNumber(value: number | undefined, fractionDigits = 0): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
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
  const hasGps = typeof measurement.latitude === "number" && typeof measurement.longitude === "number";
  const hasUtm = typeof measurement.utmEasting === "number" && typeof measurement.utmNorthing === "number" && !!measurement.utmZone;

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const dataUrl = await compressImage(file);
      onChange({ ...measurement, photo: dataUrl });
    } catch {}
  };

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Photo thumbnail or index badge */}
        {measurement.photo ? (
          <img
            src={measurement.photo}
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
          <p className="text-sm font-medium truncate">{measurement.label || "Untitled measurement"}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs font-mono text-primary">
              Strike {measurement.strike || "--"} / Dip {measurement.dip || "--"}
            </span>
            {measurement.featureType && (
              <span className="text-xs text-muted-foreground">{measurement.featureType}</span>
            )}
            {measurement.rockLayerType && (
              <span className="text-xs text-muted-foreground">{measurement.rockLayerType}</span>
            )}
            {measurement.location && (
              <span className="text-xs text-muted-foreground truncate">{measurement.location}</span>
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
        <div className="px-4 pb-4 pt-2 border-t bg-muted/30 space-y-3">
          {/* Photo slot */}
          <div className="space-y-1">
            <Label className="text-xs">Outcrop / Field Photo</Label>
            {measurement.photo ? (
              <div className="relative inline-block">
                <img
                  src={measurement.photo}
                  alt="outcrop"
                  className="w-full max-w-xs h-40 object-cover rounded-xl border border-border shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...measurement, photo: undefined })}
                  className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
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

          {/* Fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs">Label / Name</Label>
              <Input autoFocus={initiallyOpen} value={measurement.label} onChange={(e) => upd("label", e.target.value)} placeholder="e.g. Outcrop A — bedding plane" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Strike</Label>
              <Input type="text" inputMode="numeric" value={measurement.strike} onChange={(e) => upd("strike", e.target.value)} onBlur={() => upd("strike", normalizeStrike(measurement.strike))} placeholder="0–359°" className="h-10 text-base font-mono" aria-label="Strike in degrees" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dip</Label>
              <Input type="text" inputMode="decimal" value={measurement.dip} onChange={(e) => upd("dip", e.target.value)} onBlur={() => upd("dip", normalizeAngle(measurement.dip, 90))} placeholder="0–90°" className="h-10 text-base font-mono" aria-label="Dip in degrees" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Feature Type</Label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                value={measurement.featureType}
                onChange={(e) => upd("featureType", e.target.value)}
              >
                <option value="">Select...</option>
                <option>Bedding plane</option>
                <option>Fault plane</option>
                <option>Foliation</option>
                <option>Cleavage</option>
                <option>Joint / fracture</option>
                <option>Vein</option>
                <option>Contact</option>
                <option>Unconformity</option>
                <option>Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rock / Layer Type</Label>
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
              <Label className="text-xs">Dataset</Label>
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
              <Label className="text-xs">Location / Outcrop</Label>
              <Input value={measurement.location} onChange={(e) => upd("location", e.target.value)} placeholder="e.g. GPS or site name" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date &amp; Time</Label>
              <Input type="datetime-local" value={measurement.date} onChange={(e) => upd("date", e.target.value)} className="h-8 text-sm" />
            </div>
            {(hasGps || hasUtm) && (
              <div className="col-span-2 sm:col-span-3 rounded-xl border bg-card p-3 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-muted-foreground uppercase tracking-wide">
                  <MapPin className="w-3.5 h-3.5" />
                  Coordinates
                </div>
                {hasGps && (
                  <div className="font-mono">
                    Lat/Long: {measurement.latitude!.toFixed(6)}, {measurement.longitude!.toFixed(6)}
                    {typeof measurement.gpsAccuracy === "number" && (
                      <span className="text-muted-foreground"> · ±{formatNumber(measurement.gpsAccuracy, 1)} m</span>
                    )}
                  </div>
                )}
                {hasUtm && (
                  <div className="font-mono">
                    UTM (WGS84): Zone {measurement.utmZone} · {formatNumber(measurement.utmEasting)} mE · {formatNumber(measurement.utmNorthing)} mN
                  </div>
                )}
              </div>
            )}
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs">Notes</Label>
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
    ...latLonToUTM(latitude, longitude),
    location: measurement.location || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
}

export default function StrikeDipPage() {
  const { toast } = useToast();
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
  const visibleMeasurements = useMemo(() => {
    if (selectedDatasetId === "all") return measurements;
    if (selectedDatasetId === "uncategorized") return measurements.filter((m) => !m.datasetId);
    return measurements.filter((m) => String(m.datasetId ?? "") === selectedDatasetId);
  }, [measurements, selectedDatasetId]);
  const selectedDatasetName = selectedDatasetId === "all"
    ? "All Datasets"
    : selectedDatasetId === "uncategorized"
      ? "Uncategorized"
      : allFolders.find((folder: any) => String(folder.id) === selectedDatasetId)?.name || "Dataset";

  useEffect(() => {
    saveMeasurements(measurements);
  }, [measurements]);

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
    if (!navigator.geolocation) {
      setMeasurements((prev) => [...prev, measurement]);
      if (successTitle) toast({ title: successTitle, description: successDescription });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMeasurements((prev) => [...prev, addGpsToMeasurement(measurement, position)]);
        if (successTitle) toast({ title: successTitle, description: successDescription });
      },
      () => {
        setMeasurements((prev) => [...prev, measurement]);
        if (successTitle) toast({ title: successTitle, description: successDescription });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const addManual = () => {
    setManualDraft(blankMeasurement(selectedDatasetId === "all" || selectedDatasetId === "uncategorized" ? null : selectedDatasetId));
    setManualOpen(true);
  };

  const saveManualMeasurement = () => {
    const strike = normalizeStrike(manualDraft.strike);
    const dip = normalizeAngle(manualDraft.dip, 90);
    if (!strike || !dip) {
      toast({ title: "Strike and dip required", description: "Enter a strike from 0–359° and a dip from 0–90°.", variant: "destructive" });
      return;
    }
    const strikeDegrees = Number(strike);
    const dipDegrees = Number(dip);
    const dipDirectionDegrees = ((strikeDegrees + 90) % 360);
    const measurement: StrikeDipMeasurement = { ...manualDraft, strike, dip, strikeDegrees, dipDegrees, dipDirectionDegrees, dipDir: `${dipDirectionDegrees.toString().padStart(3, "0")}° ${deriveDipDir(strike)}`, convention: "right-hand-rule", northReference: "magnetic", quality: "manual" };
    setMeasurements((prev) => [...prev, measurement]);
    setNewlyCreatedId(measurement.id);
    setManualOpen(false);
    toast({ title: "Measurement saved", description: `Strike ${strike}° / Dip ${dip}°` });
  };

  const updateMeasurementById = (id: string, m: StrikeDipMeasurement) => {
    setMeasurements((prev) => prev.map((item) => item.id === id ? m : item));
  };

  const deleteMeasurementById = (id: string) => {
    const measurement = measurements.find((item) => item.id === id);
    if (!measurement || !confirm(`Delete "${measurement.label || "this measurement"}"? You can restore it from Settings for 20 days.`)) return;
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
    );
    toast({ title: result === "shared" ? "Export ready" : "Exported", description: `${visibleMeasurements.length} measurements prepared for Excel (photos not included).` });
  };

  const clearAll = () => {
    if (!confirm(`Delete all ${measurements.length} measurements? You can restore them from Settings for 20 days.`)) return;
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
          const m: StrikeDipMeasurement = {
            ...blankMeasurement(selectedDatasetId === "all" || selectedDatasetId === "uncategorized" ? null : selectedDatasetId),
            ...capture,
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
              </select>
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
