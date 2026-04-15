import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompassModal } from "@/components/CompassModal";
import { Plus, Trash2, Pencil, Compass, ChevronUp, Download, X, Camera, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

/* ── Types ─────────────────────────────────────────────────────────────── */
export interface StrikeDipMeasurement {
  id: string;
  label: string;
  strike: string;
  dip: string;
  dipDir: string;
  location: string;
  date: string;
  featureType: string;
  notes: string;
  photo?: string;
}

/* ── localStorage ───────────────────────────────────────────────────────── */
const KEY = "geofield_strike_dip";

export function loadMeasurements(): StrikeDipMeasurement[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

function saveMeasurements(items: StrikeDipMeasurement[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("strike-dip-updated"));
}

function deriveDipDir(strikeStr: string): string {
  const n = parseFloat(strikeStr);
  if (isNaN(n)) return "";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(((n + 90) % 360) / 22.5) % 16];
}

function blankMeasurement(): StrikeDipMeasurement {
  return {
    id: crypto.randomUUID(),
    label: "",
    strike: "",
    dip: "",
    dipDir: "",
    location: "",
    date: new Date().toISOString().slice(0, 10),
    featureType: "",
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

/* ── Row component ──────────────────────────────────────────────────────── */
function MeasurementRow({
  measurement, index, onChange, onDelete,
}: {
  measurement: StrikeDipMeasurement;
  index: number;
  onChange: (m: StrikeDipMeasurement) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const upd = (k: keyof StrikeDipMeasurement, v: string) => onChange({ ...measurement, [k]: v });

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
              {measurement.dipDir ? ` ${measurement.dipDir}` : ""}
            </span>
            {measurement.featureType && (
              <span className="text-xs text-muted-foreground">{measurement.featureType}</span>
            )}
            {measurement.location && (
              <span className="text-xs text-muted-foreground truncate">{measurement.location}</span>
            )}
          </div>
        </div>

        <button onClick={() => setOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          {open ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
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
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary transition-colors text-muted-foreground hover:text-primary text-sm w-full"
              >
                <Camera className="w-4 h-4 shrink-0" />
                Attach photo (camera or file)
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs">Label / Name</Label>
              <Input value={measurement.label} onChange={(e) => upd("label", e.target.value)} placeholder="e.g. Outcrop A — bedding plane" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Strike</Label>
              <Input value={measurement.strike} onChange={(e) => upd("strike", e.target.value)} placeholder="e.g. 045°" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dip</Label>
              <Input value={measurement.dip} onChange={(e) => upd("dip", e.target.value)} placeholder="e.g. 30°" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dip Direction</Label>
              <Input value={measurement.dipDir} onChange={(e) => upd("dipDir", e.target.value)} placeholder="e.g. SE" className="h-8 text-sm" />
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
              <Label className="text-xs">Location / Outcrop</Label>
              <Input value={measurement.location} onChange={(e) => upd("location", e.target.value)} placeholder="e.g. GPS or site name" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={measurement.date} onChange={(e) => upd("date", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={measurement.notes} onChange={(e) => upd("notes", e.target.value)} placeholder="Fold vergence, shear sense, quality of measurement…" className="h-8 text-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function StrikeDipPage() {
  const { toast } = useToast();
  const [measurements, setMeasurements] = useState<StrikeDipMeasurement[]>(loadMeasurements);
  const [compassOpen, setCompassOpen] = useState(false);

  useEffect(() => {
    saveMeasurements(measurements);
  }, [measurements]);

  const addManual = () => {
    setMeasurements((prev) => [...prev, blankMeasurement()]);
  };

  const updateMeasurement = (idx: number, m: StrikeDipMeasurement) => {
    setMeasurements((prev) => { const next = [...prev]; next[idx] = m; return next; });
  };

  const deleteMeasurement = (idx: number) => {
    setMeasurements((prev) => prev.filter((_, i) => i !== idx));
  };

  const exportExcel = () => {
    if (measurements.length === 0) {
      toast({ title: "Nothing to export", description: "Add at least one measurement first.", variant: "destructive" });
      return;
    }
    const headers = ["#", "Label", "Strike", "Dip", "Dip Direction", "Feature Type", "Location", "Date", "Notes"];
    const rows = measurements.map((m, i) => [
      i + 1,
      m.label,
      m.strike,
      m.dip,
      m.dipDir,
      m.featureType,
      m.location,
      m.date,
      m.notes,
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Column widths
    ws["!cols"] = [
      { wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
      { wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 40 },
    ];

    // Style header row bold (xlsx community edition supports basic styles via s)
    const headerRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: "E8F0FE" } } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Strike & Dip");
    XLSX.writeFile(wb, `strike_dip_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Exported", description: `${measurements.length} measurements saved to Excel (photos not included).` });
  };

  const clearAll = () => {
    if (!confirm(`Delete all ${measurements.length} measurements? This cannot be undone.`)) return;
    setMeasurements([]);
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
              {measurements.length} measurement{measurements.length !== 1 ? "s" : ""} recorded
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {measurements.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
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
        {measurements.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Compass className="w-10 h-10 opacity-30" />
            </div>
            <div className="text-center">
              <p className="font-medium">No measurements yet</p>
              <p className="text-sm mt-1">Use the compass button to capture a reading from your phone,<br />or enter strike and dip values manually.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {measurements.map((m, idx) => (
              <MeasurementRow
                key={m.id}
                measurement={m}
                index={idx}
                onChange={(updated) => updateMeasurement(idx, updated)}
                onDelete={() => deleteMeasurement(idx)}
              />
            ))}
          </div>
        )}
      </div>

      <CompassModal
        open={compassOpen}
        onClose={() => setCompassOpen(false)}
        onCapture={(strike, dip) => {
          const m: StrikeDipMeasurement = {
            ...blankMeasurement(),
            strike,
            dip,
            dipDir: deriveDipDir(strike),
          };
          setMeasurements((prev) => [...prev, m]);
          toast({ title: "Measurement captured", description: `Strike ${strike} / Dip ${dip}` });
        }}
      />
    </Layout>
  );
}
