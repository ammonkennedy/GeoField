import { BulkRecords } from "@/components/BulkRecords";
import { MeasurementRow, ROCK_LAYER_OPTIONS, PLANE_FEATURE_TYPES, LINEATION_FEATURE_TYPES } from "@/components/MeasurementRow";
import { getAccuratePosition } from "@/lib/gps";
import { applyMeasurementEdit, validMeasurementAngle } from "@/lib/measurement-edit";
import { orderMeasurements } from "@/lib/measurement-order";
import { stampMeasurementAtSave, toLocalDateTimeInputValue } from "@/lib/measurement-save-time";
import { elevationFromCoordinates } from "@/lib/elevation";
import { resolveDatasetId } from "@/lib/dataset-identity";
import { useState, useEffect, useMemo } from "react";
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
import { Plus, Compass, Download, X, FolderOpen } from "lucide-react";
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
import { requireAccountForSave } from "@/lib/guest-access";

function deriveDipDir(strikeStr: string): string {
  const n = parseFloat(strikeStr);
  if (isNaN(n)) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((n + 90) % 360) / 22.5) % 16];
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
  const presetAccount = getStorageAccountId() || "guest";
  const presetKey = `geofield-clinometer-presets:${presetAccount}`;
  const [presetRevision, setPresetRevision] = useState(0);
  const presets = useMemo(() => {
    const defaults = { planeFeature: "", lineFeature: "Lineation", rockLayerType: "", datasetId: "" };
    try {
      const stored = JSON.parse(localStorage.getItem(presetKey) || "{}");
      for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
        if (typeof stored?.[key] === "string") defaults[key] = stored[key];
      }
    } catch { /* Keep usable defaults if preferences are unavailable. */ }
    return defaults;
  }, [presetKey, presetRevision]);
  const updatePreset = (key: keyof typeof presets, value: string) => {
    try {
      localStorage.setItem(presetKey, JSON.stringify({ ...presets, [key]: value }));
      setPresetRevision(revision => revision + 1);
    } catch { toast({ title: "Could not save preset", description: "Check available device storage and try again.", variant: "destructive" }); }
  };

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
    const ordered = orderMeasurements(measurements).reverse();
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

  const addMeasurementWithGps = (measurement: StrikeDipMeasurement, successTitle?: string, successDescription?: string, openSheet = true) => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return false;
    const savingAccountId = getStorageAccountId();
    measurement = stampMeasurementAtSave(measurement);
    // Persist immediately; GPS and elevation refine the saved record asynchronously.
    try { changeMeasurements((prev) => [...prev, measurement]); }
    catch {
      toast({ title: "Measurement could not be saved", description: "The reading is still open. Check available device storage and try again.", variant: "destructive" });
      return false;
    }
    if (openSheet) setNewlyCreatedId(measurement.id);
    if (successTitle) toast({ title: successTitle, description: successDescription });
    void getAccuratePosition().then(
      (position) => {
        if (!savingAccountId || getStorageAccountId() !== savingAccountId) return;
        // Merge into the latest saved record so typing, photos, dataset changes,
        // or deletion while GPS is pending cannot be overwritten or resurrected.
        try { changeMeasurements((current) => current.map((item) => {
          if (item.id !== measurement.id || item.location !== measurement.location ||
              item.latitude !== measurement.latitude || item.longitude !== measurement.longitude) return item;
          return {
            ...addGpsToMeasurement(item, position),
            updatedAt: new Date(Math.max(Date.now(), (Date.parse(item.updatedAt ?? "") || 0) + 1)).toISOString(),
          };
        }));
          if (elevationFromCoordinates(position.coords).elevation === null) toast({ title: "Measurement saved without elevation", description: "The phone supplied coordinates but no altitude. Your measurement and location are saved." });
          if (position.coords.accuracy > 20) toast({ title: "GPS accuracy is limited", description: `Estimated accuracy: ±${Math.round(position.coords.accuracy)} m. A clear view of the sky and Precise Location can help.` });
        } catch { toast({ title: "Measurement saved without GPS", description: "The location update could not be saved. Your measurement is still available.", variant: "destructive" }); }
      },
    ).catch(() => {
      if (getStorageAccountId() === savingAccountId) toast({ title: "Measurement saved without a fresh GPS fix", description: "Check location permission and your view of the sky. Your measurement is saved.", variant: "destructive" });
    });
    return true;
  };

  const addManual = () => {
    setManualDraft(blankMeasurement(selectedDatasetId === "all" || selectedDatasetId === "uncategorized" ? null : selectedDatasetId));
    setManualOpen(true);
  };

  const saveManualMeasurement = () => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return;
    const validStrike = validMeasurementAngle(manualDraft.strike, 360, true);
    const validDip = validMeasurementAngle(manualDraft.dip, 90);
    if (validStrike === null || validDip === null) {
      toast({ title: "Strike and dip required", description: "Enter a strike from 0–359° and a dip from 0–90°.", variant: "destructive" });
      return;
    }
    const strike = String(validStrike), dip = String(validDip);
    const strikeDegrees = validStrike;
    const dipDegrees = validDip;
    const dipDirectionDegrees = ((strikeDegrees + 90) % 360);
    const measurement: StrikeDipMeasurement = { ...manualDraft, strike, dip, strikeDegrees, dipDegrees, dipDirectionDegrees, dipDir: `${dipDirectionDegrees.toString().padStart(3, "0")}° ${deriveDipDir(strike)}`, convention: "right-hand-rule", northReference: "magnetic", quality: "manual", updatedAt: new Date().toISOString() };
    if (addMeasurementWithGps(measurement, "Measurement saved", `Strike ${strike}° / Dip ${dip}°`)) setManualOpen(false);
  };

  const updateMeasurementById = (id: string, patch: Partial<StrikeDipMeasurement>) => {
    if (!requireAccountForSave(authData?.user, setLocation, "/strike-dip")) return false;
    try {
      changeMeasurements((prev) => prev.map((item) => item.id === id ? { ...applyMeasurementEdit(item, patch), updatedAt: new Date().toISOString() } : item));
      return true;
    } catch (error) { toast({ title: "Measurement edit could not be saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); return false; }
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
            Use Clinometer
          </Button>
          <Button variant="outline" onClick={addManual} className="flex-1 gap-2">
            <Plus className="w-4 h-4" />
            Enter Manually
          </Button>
        </div>

        <BulkRecords measurements={visibleMeasurements} datasets={allFolders} />

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
        renderPresets={(mode) => {
          const featureKey = mode === "plane" ? "planeFeature" : "lineFeature";
          const features = mode === "plane" ? PLANE_FEATURE_TYPES : LINEATION_FEATURE_TYPES;
          const selectClass = "h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-white";
          return <div className="space-y-3 rounded-xl border border-slate-700 p-3">
            <p className="text-xs text-slate-400">Presets stay selected for your next measurements.</p>
            <label className="block space-y-1 text-sm"><span>Feature type</span><select aria-label="Capture feature type" className={selectClass} value={presets[featureKey]} onChange={e => updatePreset(featureKey, e.target.value)}><option value="">Select feature type</option>{features.map(value => <option key={value}>{value}</option>)}{presets[featureKey] && !features.includes(presets[featureKey]) && <option>{presets[featureKey]}</option>}</select></label>
            <Input aria-label="Custom capture feature type" className="bg-slate-900 text-white" placeholder="Or type your own feature type" value={presets[featureKey]} onChange={e => updatePreset(featureKey, e.target.value)} />
            <label className="block space-y-1 text-sm"><span>Layer type</span><select aria-label="Capture layer type" className={selectClass} value={presets.rockLayerType} onChange={e => updatePreset("rockLayerType", e.target.value)}><option value="">Select layer type</option>{ROCK_LAYER_OPTIONS.map(value => <option key={value}>{value}</option>)}{presets.rockLayerType && !ROCK_LAYER_OPTIONS.includes(presets.rockLayerType) && <option>{presets.rockLayerType}</option>}</select></label>
            <Input aria-label="Custom capture layer type" className="bg-slate-900 text-white" placeholder="Or type your own layer type" value={presets.rockLayerType} onChange={e => updatePreset("rockLayerType", e.target.value)} />
            <label className="block space-y-1 text-sm"><span>Dataset</span><select aria-label="Capture dataset" className={selectClass} value={String(resolveDatasetId(presets.datasetId, localDatasets) ?? "")} onChange={e => updatePreset("datasetId", e.target.value)}><option value="">Uncategorized</option>{presets.datasetId && !allFolders.some((folder: any) => String(folder.id) === String(resolveDatasetId(presets.datasetId, localDatasets))) && <option value={String(resolveDatasetId(presets.datasetId, localDatasets))}>Saved dataset (unavailable)</option>}{allFolders.map((folder: any) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          </div>;
        }}
        onCapture={(capture: StrikeDipCapture) => {
          if (presets.datasetId && !allFolders.some((folder: any) => String(folder.id) === String(resolveDatasetId(presets.datasetId, localDatasets)))) {
            toast({ title: "Choose an available dataset", description: "The preset dataset is unavailable. Select a dataset or Uncategorized before capturing.", variant: "destructive" });
            return false;
          }
          if (capture.measurementType === "lineation") {
            const m: StrikeDipMeasurement = {
              ...blankMeasurement(resolveDatasetId(presets.datasetId, localDatasets) || null),
              ...capture,
              measurementType: "lineation",
              label: "Lineation",
              featureType: presets.lineFeature,
              rockLayerType: presets.rockLayerType,
            };
            return addMeasurementWithGps(m, "Lineation captured", `Azimuth ${capture.trendDegrees}° / Plunge ${capture.plungeDegrees}°`, false);
          }
          const m: StrikeDipMeasurement = {
            ...blankMeasurement(resolveDatasetId(presets.datasetId, localDatasets) || null),
            ...capture,
            measurementType: "plane",
            featureType: presets.planeFeature,
            rockLayerType: presets.rockLayerType,
            strike: String(capture.strikeDegrees),
            dip: String(capture.dipDegrees),
            dipDir: `${capture.dipDirectionDegrees.toString().padStart(3, "0")}° ${deriveDipDir(String(capture.strikeDegrees))}`,
          };
          return addMeasurementWithGps(m, "Measurement captured", `Strike ${m.strike}° / Dip ${m.dip}°`, false);
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
              <Input id="manual-strike" autoFocus inputMode="numeric" value={manualDraft.strike} onChange={(e) => setManualDraft((draft) => ({ ...draft, strike: e.target.value }))} placeholder="045" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-dip">Dip (0–90°)</Label>
              <Input id="manual-dip" inputMode="decimal" value={manualDraft.dip} onChange={(e) => setManualDraft((draft) => ({ ...draft, dip: e.target.value }))} placeholder="30" />
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
                <option value="">Select…</option>
                {PLANE_FEATURE_TYPES.map(type => <option key={type}>{type}</option>)}
                {manualDraft.featureType && !PLANE_FEATURE_TYPES.includes(manualDraft.featureType) && <option>{manualDraft.featureType}</option>}
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
