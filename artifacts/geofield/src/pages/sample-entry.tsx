import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Droplet, Mountain, Sprout, ArrowLeft, Save, Camera, X, MapPin, Loader2, Plus, GripVertical, Mic, MicOff, Video, Image as ImageIcon, BookmarkCheck, FileQuestion } from "lucide-react";
import { useSamplesMutations } from "@/hooks/use-geofield";
import { useGetFolders, useGetSample } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { enqueue, getQueue, updateQueuedSample } from "@/lib/offline-queue";
import { storeMediaDataUrl, getStoredMediaDataUrl, type StoredMediaMetadata } from "@/lib/media-storage";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import { BaseFields, WaterFields, RockFields, SoilFields, OtherFields } from "@/components/fields/SchemaForms";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { latLngToUTM, parseCoords as parseCoordsUTM } from "@/lib/utm";

const sampleTypes = [
  { id: 'water', label: 'Water', icon: Droplet, color: 'text-[var(--color-water)]', bg: 'bg-[var(--color-water)]/10' },
  { id: 'rock', label: 'Rock', icon: Mountain, color: 'text-[var(--color-rock)]', bg: 'bg-[var(--color-rock)]/10' },
  { id: 'soil_sand', label: 'Soil/Sediment', icon: Sprout, color: 'text-[var(--color-soil)]', bg: 'bg-[var(--color-soil)]/10' },
  { id: 'other', label: 'Other', icon: FileQuestion, color: 'text-muted-foreground', bg: 'bg-muted' },
] as const;

const formSchema = z.object({
  sampleType: z.enum(['water', 'rock', 'soil_sand', 'other']),
  sampleId: z.string().min(1, "Sample ID is required"),
  folderId: z.string().optional(),
  notes: z.string().optional(),
  fields: z.record(z.any()),
});

type FormValues = z.infer<typeof formSchema>;
type GpsStatus = "idle" | "loading" | "success" | "error" | "denied";
type SampleTypeId = 'water' | 'rock' | 'soil_sand' | 'other';

type MediaSlot = {
  type: "photo" | "video";
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  stored?: StoredMediaMetadata;
} | null;

interface CustomParam {
  id: string;
  label: string;
  value: string;
}

const TEMPLATE_KEY = "geofield_custom_param_templates";

function loadTemplates(): Partial<Record<SampleTypeId, string[]>> {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}"); }
  catch { return {}; }
}

function saveTemplate(type: SampleTypeId, labels: string[]) {
  const all = loadTemplates();
  all[type] = labels;
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all));
}

function templateToParams(labels: string[]): CustomParam[] {
  return labels.map((label) => ({ id: `tpl_${crypto.randomUUID()}`, label, value: "" }));
}

function getTypeLabel(type: string) {
  if (type === "water") return "Water";
  if (type === "rock") return "Rock";
  if (type === "soil_sand") return "Soil/Sediment";
  if (type === "other") return "Other";
  return "Sample";
}

function isLocalDatasetId(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric < 0;
}

async function hydrateMediaSlots(fields: Record<string, any>): Promise<[MediaSlot, MediaSlot, MediaSlot]> {
  const empty: [MediaSlot, MediaSlot, MediaSlot] = [null, null, null];

  if (Array.isArray(fields.media)) {
    const loaded = await Promise.all(
      (fields.media as any[]).slice(0, 3).map(async (m: any) => {
        if (m?.dataUrl && m?.type) return { type: m.type as "photo" | "video", dataUrl: m.dataUrl };
        if (m?.storageKey) {
          const dataUrl = await getStoredMediaDataUrl(m.storageKey);
          if (dataUrl) {
            return {
              type: (m.kind || m.type) as "photo" | "video",
              dataUrl,
              fileName: m.fileName,
              mimeType: m.mimeType,
              sizeBytes: m.sizeBytes,
              stored: m as StoredMediaMetadata,
            };
          }
        }
        if (m?.cloudUrl && (m?.kind || m?.type)) {
          return { type: (m.kind || m.type) as "photo" | "video", dataUrl: m.cloudUrl, stored: m };
        }
        return null;
      })
    );
    while (loaded.length < 3) loaded.push(null);
    return loaded as [MediaSlot, MediaSlot, MediaSlot];
  }

  if (fields.photo) return [{ type: "photo", dataUrl: fields.photo }, null, null];
  return empty;
}

export default function SampleEntry() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const isEdit = Boolean(id && id !== "new");
  const isOfflineEdit = Boolean(id?.startsWith("q_"));
  const sampleLookupId = isEdit && !isOfflineEdit && id ? id : "";
  const { toast } = useToast();

  const { data: existingSample, isLoading: loadingSample } = useGetSample(sampleLookupId, {
    query: { enabled: isEdit && !isOfflineEdit && Boolean(id) }
  });
  const { data: folders } = useGetFolders();
  const { createSample, updateSample } = useSamplesMutations();
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];

  const [mediaSlots, setMediaSlots] = useState<[MediaSlot, MediaSlot, MediaSlot]>([null, null, null]);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [customParams, setCustomParams] = useState<CustomParam[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCaptureInputRef = useRef<HTMLInputElement>(null);
  const videoCaptureInputRef = useRef<HTMLInputElement>(null);
  const activeSlotRef = useRef<number>(0);

  useEffect(() => {
    const refresh = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sampleType: 'rock',
      sampleId: '',
      folderId: '',
      notes: '',
      fields: {}
    }
  });

  useEffect(() => {
    if (isEdit) return;
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setValue("fields.collectionDate", local);

    if (!navigator.geolocation) { setGpsStatus("error"); return; }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue("fields.location", `${pos.coords.latitude.toFixed(7)}, ${pos.coords.longitude.toFixed(7)}`);
        if (Number.isFinite(pos.coords.accuracy)) {
          setValue("fields.gpsAccuracy", Math.round(pos.coords.accuracy));
        }
        setGpsStatus("success");
      },
      (err) => { setGpsStatus(err.code === 1 ? "denied" : "error"); },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, [isEdit, setValue]);

  useEffect(() => {
    if (!isOfflineEdit || !id) return;
    const queued = getQueue().find((item) => item.queuedId === id);
    if (!queued) return;
    const fields = queued.payload.fields || {};
    reset({
      sampleType: queued.payload.sampleType as any,
      sampleId: queued.payload.sampleId,
      folderId: queued.payload.folderId ? String(queued.payload.folderId) : '',
      notes: queued.payload.notes || '',
      fields: { ...fields, photo: undefined, media: undefined, customParams: undefined },
    });
    if (Array.isArray(fields.customParams)) {
      setCustomParams(fields.customParams.map((p: any, i: number) => ({
        id: `cp_${i}_${Date.now()}`,
        label: p.label ?? "",
        value: p.value ?? "",
      })));
    }
    hydrateMediaSlots(fields).then(setMediaSlots);
  }, [isOfflineEdit, id, reset]);

  useEffect(() => {
    if (existingSample && isEdit && !isOfflineEdit) {
      const fields = existingSample.fields as Record<string, any> || {};
      hydrateMediaSlots(fields).then(setMediaSlots);
      if (Array.isArray(fields.customParams)) {
        setCustomParams(fields.customParams.map((p: any, i: number) => ({
          id: `cp_${i}_${Date.now()}`,
          label: p.label ?? "",
          value: p.value ?? "",
        })));
      }
      reset({
        sampleType: existingSample.sampleType as any,
        sampleId: existingSample.sampleId,
        folderId: existingSample.folderId ? String(existingSample.folderId) : '',
        notes: existingSample.notes || '',
        fields: { ...fields, photo: undefined, media: undefined, customParams: undefined },
      });
    }
  }, [existingSample, isEdit, isOfflineEdit, reset]);

  const currentType = watch("sampleType");
  const locationValue = watch("fields.location") as string | undefined;
  const isPending = createSample.isPending || updateSample.isPending || isSavingMedia;

  const prevTypeRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEdit) return;
    if (prevTypeRef.current === currentType) return;
    prevTypeRef.current = currentType;
    const templates = loadTemplates();
    const labels = templates[currentType as SampleTypeId] ?? [];
    if (labels.length > 0) setCustomParams(templateToParams(labels));
    else if (currentType === "other") setCustomParams([]);
  }, [currentType, isEdit]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const slotIndex = activeSlotRef.current;
    const setSlot = (slot: MediaSlot) =>
      setMediaSlots((prev) => {
        const next = [...prev] as [MediaSlot, MediaSlot, MediaSlot];
        next[slotIndex] = slot;
        return next;
      });

    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.src = url;
      vid.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (vid.duration > 10) {
          toast({ title: "Video too long", description: "Please choose a clip that is 10 seconds or shorter." });
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => setSlot({
          type: "video",
          dataUrl: ev.target?.result as string,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        reader.readAsDataURL(file);
      };
      vid.onerror = () => { URL.revokeObjectURL(url); toast({ title: "Could not read video", description: "Try a different format (MP4 recommended)." }); };
    } else {
      try {
        setSlot({ type: "photo", dataUrl: await compressImage(file), fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      } catch {
        const reader = new FileReader();
        reader.onload = (ev) => setSlot({ type: "photo", dataUrl: ev.target?.result as string, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
        reader.readAsDataURL(file);
      }
    }
  };

  const openSlot = (index: number, source: "library" | "camera" | "video" = "library") => {
    activeSlotRef.current = index;
    if (source === "camera") photoCaptureInputRef.current?.click();
    else if (source === "video") videoCaptureInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const clearSlot = (index: number) =>
    setMediaSlots((prev) => {
      const next = [...prev] as [MediaSlot, MediaSlot, MediaSlot];
      next[index] = null;
      return next;
    });

  async function prepareMediaForSave(slots: [MediaSlot, MediaSlot, MediaSlot]) {
    const filled = slots.filter(Boolean) as Exclude<MediaSlot, null>[];
    if (filled.length === 0) return [];
    return Promise.all(filled.map(async (slot) => {
      if (slot.stored) return slot.stored;
      return storeMediaDataUrl({ kind: slot.type, dataUrl: slot.dataUrl, fileName: slot.fileName, mimeType: slot.mimeType });
    }));
  }

  const toggleRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Safari on iOS.");
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as SpeechRecognitionResultList)
        .slice(event.resultIndex)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(" ");
      const current = (document.getElementById("notes") as HTMLTextAreaElement)?.value ?? "";
      const joined = current ? `${current.trimEnd()} ${transcript.trim()}` : transcript.trim();
      setValue("notes", joined);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const addCustomParam = () => setCustomParams((prev) => [...prev, { id: `cp_${Date.now()}`, label: "", value: "" }]);
  const updateCustomParam = (id: string, field: "label" | "value", val: string) =>
    setCustomParams((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  const removeCustomParam = (id: string) => setCustomParams((prev) => prev.filter((p) => p.id !== id));

  const saveAsDefault = () => {
    const labels = customParams.map((p) => p.label).filter(Boolean);
    saveTemplate(currentType as SampleTypeId, labels);
    toast({
      title: "Template saved",
      description: `${labels.length} custom parameter${labels.length !== 1 ? "s" : ""} will now appear on all new ${getTypeLabel(currentType)} sheets.`,
    });
  };

  const onSubmit = async (data: FormValues) => {
    const processedFields: Record<string, any> = {};
    Object.entries(data.fields).forEach(([k, v]) => {
      if (v === "") return;
      const num = Number(v);
      processedFields[k] = !isNaN(num) && typeof v === "string" && v.trim() !== "" ? num : v;
    });

    const filledSlots = mediaSlots.some(Boolean);
    if (filledSlots) {
      try {
        setIsSavingMedia(true);
        const storedMedia = await prepareMediaForSave(mediaSlots);
        processedFields.media = storedMedia;
        processedFields.photoCount = storedMedia.filter((m) => m.kind === "photo").length;
        processedFields.videoCount = storedMedia.filter((m) => m.kind === "video").length;
        const firstPhoto = storedMedia.find((m) => m.kind === "photo");
        if (firstPhoto) processedFields.primaryPhoto = { storageKey: firstPhoto.storageKey, cloudUrl: firstPhoto.cloudUrl || null, syncStatus: firstPhoto.syncStatus };
      } catch {
        toast({ title: "Could not save media", description: "The sample was not saved because the photo/video could not be stored on this device.", variant: "destructive" });
        setIsSavingMedia(false);
        return;
      } finally {
        setIsSavingMedia(false);
      }
    }

    const nonEmptyParams = customParams.filter((p) => p.label.trim());
    if (nonEmptyParams.length > 0) processedFields.customParams = nonEmptyParams.map((p) => ({ label: p.label.trim(), value: p.value }));

    const selectedFolderId = data.folderId || null;
    const syncedLocalDataset = localDatasets.find(
      (dataset) => String(dataset.id) === String(selectedFolderId) && dataset.cloudId
    );
    const folderId = syncedLocalDataset?.cloudId ?? selectedFolderId;
    const shouldSaveOffline =
      !navigator.onLine ||
      localStorage.getItem("geofield-demo-mode") === "true" ||
      isLocalDatasetId(folderId);
    const payload = {
      sampleType: data.sampleType,
      sampleId: data.sampleId,
      folderId,
      notes: data.notes,
      fields: processedFields,
    };

    if (isOfflineEdit && id) {
      updateQueuedSample(id, payload);
      toast({ title: "Sample updated", description: "Your offline sample edits were saved on this device." });
      setLocation("/");
    } else if (isEdit && id) {
      updateSample.mutate({ id, data: payload }, { onSuccess: () => setLocation("/") });
    } else if (shouldSaveOffline) {
      enqueue(payload);
      toast({
        title: "Saved offline",
        description: isLocalDatasetId(folderId)
          ? "This dataset is local to this device. Create a cloud dataset to sync it across devices."
          : filledSlots
            ? "Your sample is stored on this device. Photos/videos are kept in local media storage until cloud sync is added."
            : "Your sample is stored on this device and will sync automatically when you're back online."
      });
      setLocation("/");
    } else {
      createSample.mutate({ data: payload }, {
        onSuccess: () => setLocation("/"),
        onError: () => {
          enqueue(payload);
          toast({
            title: "Saved offline",
            description: "GeoField could not reach your account data service, so this sample was saved on this device and will sync later."
          });
          setLocation("/");
        }
      });
    }
  };

  if (isEdit && !isOfflineEdit && loadingSample) return (
    <Layout>
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-48 bg-muted rounded" />
        <div className="h-96 bg-muted rounded" />
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-3xl font-bold font-display">{isEdit ? "Edit Sample" : "New Field Sample"}</h1>
          <p className="text-muted-foreground mt-1">Record accurate parameter data directly from the field.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-20">
        <div className="space-y-3">
          <Label className="text-base">Sample Type</Label>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {sampleTypes.map((type) => {
              const isSelected = currentType === type.id;
              const Icon = type.icon;
              return (
                <div key={type.id} onClick={() => !isEdit && setValue("sampleType", type.id, { shouldValidate: true })} className={cn("relative overflow-hidden rounded-xl border p-4 cursor-pointer transition-all duration-300", isSelected ? "border-primary ring-2 ring-primary/20 shadow-md bg-card" : isEdit ? "opacity-50 cursor-not-allowed bg-muted/50 border-transparent" : "border-border bg-card hover:border-primary/50 hover:shadow-sm")}>
                  {isSelected && <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />}
                  <div className="flex items-center gap-4 relative z-10"><div className={cn("p-3 rounded-lg", type.bg, type.color)}><Icon className="w-6 h-6" /></div><span className="font-semibold text-lg">{type.label}</span></div>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="overflow-hidden shadow-lg border-border/50">
          <div className="p-6 md:p-8 space-y-8 bg-gradient-to-b from-card to-muted/20">
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>Basic Information{!isEdit && (<span className={cn("ml-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium", gpsStatus === "loading" && "bg-yellow-100 text-yellow-700", gpsStatus === "success" && "bg-green-100 text-green-700", (gpsStatus === "error" || gpsStatus === "denied") && "bg-red-100 text-red-600", gpsStatus === "idle" && "bg-muted text-muted-foreground")}>{gpsStatus === "loading" && <><Loader2 className="w-3 h-3 animate-spin" />Getting GPS...</>}{gpsStatus === "success" && <><MapPin className="w-3 h-3" />GPS captured</>}{gpsStatus === "denied" && <><MapPin className="w-3 h-3" />Location denied</>}{gpsStatus === "error" && <><MapPin className="w-3 h-3" />GPS unavailable</>}</span>)}</h3>
              <BaseFields register={register} errors={errors} />
              {(() => { const coords = parseCoordsUTM(locationValue); if (!coords) return null; const utm = latLngToUTM(coords[0], coords[1]); return <div className="flex items-start gap-2.5 bg-muted/40 border border-border rounded-lg px-3.5 py-2.5 text-sm"><MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" /><div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">UTM Coordinates (WGS84)</p><p className="font-mono text-sm text-foreground">{utm.display}</p><p className="text-xs text-muted-foreground mt-0.5">Zone {utm.zone}{utm.letter} · {utm.hemisphere === "N" ? "Northern" : "Southern"} Hemisphere</p></div></div>; })()}
            </div>

            <div className="h-px bg-border/60 w-full" />

            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</span>Parameters</h3>
              <AnimatePresence mode="wait"><motion.div key={currentType} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>{currentType === "water" && <WaterFields register={register} />}{currentType === "rock" && <RockFields register={register} />}{currentType === "soil_sand" && <SoilFields register={register} />}{currentType === "other" && <OtherFields register={register} />}</motion.div></AnimatePresence>
            </div>

            <div className="h-px bg-border/60 w-full" />

            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2"><h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</span>Custom Parameters</h3><div className="flex items-center gap-2">{customParams.length > 0 && <Button type="button" variant="outline" size="sm" className="gap-2 border-primary/40 text-primary hover:bg-primary/5" onClick={saveAsDefault} title={`Save these parameters as the default template for all new ${getTypeLabel(currentType)} sheets`}><BookmarkCheck className="w-4 h-4" />Save as default</Button>}<Button type="button" variant="outline" size="sm" className="gap-2" onClick={addCustomParam}><Plus className="w-4 h-4" />Add Parameter</Button></div></div>
              {customParams.length === 0 ? <p className="text-sm text-muted-foreground italic px-1">No custom parameters yet. Click <strong>Add Parameter</strong> to add one.</p> : <div className="space-y-3">{customParams.map((param) => <div key={param.id} className="flex gap-2 items-start group"><GripVertical className="w-4 h-4 mt-2.5 text-muted-foreground/40 shrink-0" /><Input value={param.label} onChange={(e) => updateCustomParam(param.id, "label", e.target.value)} placeholder="Parameter name" className="w-40 shrink-0 text-sm" /><Input value={param.value} onChange={(e) => updateCustomParam(param.id, "value", e.target.value)} placeholder="Value (e.g. 7.2, Present, 42 mg/L)" className="flex-1 text-sm" /><button type="button" onClick={() => removeCustomParam(param.id)} className="mt-2 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"><X className="w-4 h-4" /></button></div>)}</div>}
            </div>

            <div className="h-px bg-border/60 w-full" />

            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">4</span>Photos &amp; Video</h3>
              <p className="text-xs text-muted-foreground -mt-1">Up to 3 slots — each can be a photo or a short video clip (max 10 seconds).</p>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaChange} />
              <input ref={photoCaptureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleMediaChange} />
              <input ref={videoCaptureInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleMediaChange} />
              <div className="flex flex-wrap gap-3">
                {([0, 1, 2] as const).map((i) => {
                  const slot = mediaSlots[i];
                  const label = i === 0 ? "Primary" : i === 1 ? "Secondary" : "Additional";
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                      <div className="relative group">
                        {slot ? (
                          <>
                            {slot.type === "photo" ? (
                              <img src={slot.dataUrl} alt={`Sample photo ${i + 1}`} className="w-36 h-36 object-cover rounded-xl border border-border shadow-md cursor-pointer" onClick={() => openSlot(i)} />
                            ) : (
                              <video src={slot.dataUrl} className="w-36 h-36 object-cover rounded-xl border border-border shadow-md cursor-pointer bg-black" controls playsInline onClick={(e) => e.stopPropagation()} />
                            )}
                            <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 flex items-center gap-1 pointer-events-none">
                              {slot.type === "photo" ? <ImageIcon className="w-2.5 h-2.5" /> : <Video className="w-2.5 h-2.5" />}
                              {slot.type === "photo" ? "Photo" : "Video"}
                            </span>
                            <button type="button" onClick={() => clearSlot(i)} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"><X className="w-3.5 h-3.5" /></button>
                            {slot.type === "photo" && <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => openSlot(i, "camera")}><Camera className="w-6 h-6 text-white" /></div>}
                          </>
                        ) : (
                          <div className="w-36 rounded-xl border border-border bg-muted/30 p-2 shadow-sm">
                            <div className="h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground mb-2">
                              <div className="flex gap-2"><Camera className="w-5 h-5" /><Video className="w-5 h-5" /></div>
                            </div>
                            <div className="grid gap-1.5">
                              <Button type="button" variant="outline" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs" onClick={() => openSlot(i, "camera")}><Camera className="w-3.5 h-3.5" />Take Photo</Button>
                              <Button type="button" variant="outline" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs" onClick={() => openSlot(i, "video")}><Video className="w-3.5 h-3.5" />Record Video</Button>
                              <Button type="button" variant="ghost" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs" onClick={() => openSlot(i)}><ImageIcon className="w-3.5 h-3.5" />Choose Media</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-border/60 w-full" />

            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">5</span>Organization</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-2"><Label htmlFor="folderId">Dataset (Optional)</Label><select id="folderId" className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("folderId")}><option value="">Uncategorized</option>{allFolders.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="space-y-2 md:col-span-2"><div className="flex items-center justify-between"><Label htmlFor="notes">Field Notes</Label><button type="button" onClick={toggleRecording} title={isRecording ? "Stop recording" : "Dictate field notes"} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all", isRecording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50")}>{isRecording ? <><MicOff className="w-3.5 h-3.5" /> Stop</> : <><Mic className="w-3.5 h-3.5" /> Dictate</>}</button></div>{isRecording && <p className="text-xs text-red-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />Listening… speak your field notes now.</p>}<Textarea id="notes" placeholder="Additional observations, weather conditions, context... or click Dictate to speak." className="min-h-[120px]" {...register("notes")} /></div></div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-4 sticky bottom-6 z-20"><Button type="button" variant="outline" size="lg" className="bg-background shadow-md" onClick={() => setLocation("/")}>Cancel</Button><Button type="submit" size="lg" disabled={isPending} className="shadow-xl"><Save className="w-5 h-5 mr-2" />{isPending ? "Saving..." : isEdit ? "Update Sample" : "Save Sample"}</Button></div>
      </form>
    </Layout>
  );
}
