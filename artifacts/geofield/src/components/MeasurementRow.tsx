import { useState, useEffect, useRef } from "react";
import { LabeledPhoto } from "@/components/LabeledPhoto";
import { MeasurementAngleInput } from "@/components/MeasurementAngleInput";
import { SavePhotoButton } from "@/components/SavePhotoButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Pencil, Compass, ChevronUp, X, Camera, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStoredMediaDataUrl, storeMediaDataUrl } from "@/lib/media-storage";
import { loadMeasurements, type StrikeDipMeasurement } from "@/lib/strike-dip-measurements";
import { getStorageAccountId } from "@/lib/storage-account";
import { formatElevation } from "@/lib/elevation";

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

export const ROCK_LAYER_OPTIONS = [
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

export const PLANE_FEATURE_TYPES = ["Bedding plane", "Fault plane", "Axial plane", "Cleavage", "Joint"];
export const LINEATION_FEATURE_TYPES = ["Lineation", "Mineral lineation", "Glacial striation", "Slickenline", "Intersection lineation", "Fold axis", "Other"];

/* ── Row component ──────────────────────────────────────────────────────── */
export function MeasurementRow({
  measurement, index, allFolders, initiallyOpen = false, onChange, onDelete,
}: {
  measurement: StrikeDipMeasurement;
  index: number;
  allFolders: Array<{ id: number | string; name: string; isLocal?: boolean }>;
  initiallyOpen?: boolean;
  onChange: (m: Partial<StrikeDipMeasurement>) => boolean | void;
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
    onChange({ [k]: v });
  };
  const setDatasetId = (value: string) => onChange({ datasetId: value ? value : null });
  const { toast: photoToast } = useToast();

  const saveEditedPhoto = async (dataUrl: string) => {
    const account = getStorageAccountId();
    const stored = await storeMediaDataUrl({ kind: "photo", dataUrl, fileName: "edited-measurement.jpg", mimeType: "image/jpeg" });
    if (!account || getStorageAccountId() !== account) throw new Error("Account changed. Please reopen this photo.");
    const latest = loadMeasurements().find(item => item.id === measurement.id);
    if (!latest || latest.photoKey !== measurement.photoKey || latest.photoLocalKey !== measurement.photoLocalKey) throw new Error("The photo changed while editing. Please reopen it.");
    if (onChange({ photo: undefined, photoKey: null, photoLocalKey: stored.storageKey, photoUploadId: crypto.randomUUID() }) === false) throw new Error("Could not save your edited photo. Please try again.");
  };

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
      if (latest) onChange({ photo: undefined, photoKey: null, photoCaption: "", photoLocalKey: stored.storageKey, photoUploadId: crypto.randomUUID() });
    } catch { photoToast({ title: "Photo could not be saved", description: "Please try again. The previous photo has been kept.", variant: "destructive" }); }
  };

  return (
    <div ref={rowRef} className="rounded-2xl border border-border/80 border-l-[3px] border-l-primary/50 bg-card shadow-sm overflow-hidden scroll-mt-4">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-primary/5 to-transparent px-4 py-4">
        {/* Photo thumbnail or index badge */}
        {photoUrl ? (
          <div className="w-10 shrink-0"><LabeledPhoto key={measurement.photoLocalKey || measurement.photoKey || photoUrl} src={photoUrl} alt="Measurement photo" caption={measurement.photoCaption} onEdit={saveEditedPhoto} className="w-10 h-10 object-cover" showPreview={false} onSave={photoCaption => {
            if (onChange({ photoCaption }) === false) throw new Error("The label could not be saved. Please try again.");
          }} /></div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {index + 1}
          </div>
        )}

        <button type="button" className="flex-1 min-w-0 text-left" aria-expanded={open} aria-label={`View ${measurement.label || "measurement"}`} onClick={() => setOpen(o => !o)}> 
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
        </button>

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
                <LabeledPhoto key={measurement.photoLocalKey || measurement.photoKey || photoUrl} src={photoUrl} alt="Measurement photo" caption={measurement.photoCaption} onEdit={saveEditedPhoto} className="w-full max-w-xs h-40 object-cover" onSave={photoCaption => {
                  if (onChange({ photoCaption }) === false) throw new Error("The label could not be saved. Please try again.");
                }} />
                <button
                  type="button"
                  onClick={() => onChange({ photo: undefined, photoKey: null, photoCaption: "", photoLocalKey: undefined, photoUploadId: undefined })}
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
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Azimuth</Label><MeasurementAngleInput value={measurement.trendDegrees} label="Azimuth" maximum={360} exclusive onCommit={value => onChange({ trendDegrees: value })} /></div>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Plunge</Label><MeasurementAngleInput value={measurement.plungeDegrees} label="Plunge" maximum={90} onCommit={value => onChange({ plungeDegrees: value })} /></div>
            </> : <>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Strike</Label><MeasurementAngleInput value={measurement.strike} label="Strike" maximum={360} exclusive onCommit={value => onChange({ strike: String(value) })} /></div>
              <div className="space-y-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5"><Label className="text-xs font-semibold text-primary">Dip</Label><MeasurementAngleInput value={measurement.dip} label="Dip" maximum={90} onCommit={value => onChange({ dip: String(value) })} /></div>
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
                {(measurement.measurementType === "lineation" ? LINEATION_FEATURE_TYPES : PLANE_FEATURE_TYPES).map(type => <option key={type}>{type}</option>)}
                {measurement.featureType && !(measurement.measurementType === "lineation" ? LINEATION_FEATURE_TYPES : PLANE_FEATURE_TYPES).includes(measurement.featureType) && <option>{measurement.featureType}</option>}
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
