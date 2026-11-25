import { useBackNavigation } from "@/hooks/use-back-navigation";
import { restoreCustomParameterIds } from "@/lib/sample-parameter-order";
import { PlacePointButton } from "@/components/PlacePointButton";
import { ElevationInput } from "@/components/ElevationInput";
import { sameSampleAfterUpload } from "@/lib/sample-content";
import { resolveDatasetId } from "@/lib/dataset-identity";
import { OrderedFields } from "@/components/fields/OrderedFields";
import { capturePhotoLocation, withPhotoLocation } from "@/lib/photo-location";
import { capturePhoto } from "@/lib/capture-photo";
import { preservePhotoDirection } from "@/lib/photo-direction";
import { FolderDialog } from "@/components/FolderDialog";
import { LabeledPhoto } from "@/components/LabeledPhoto";
import { getAccuratePosition } from "@/lib/gps";
import { findSamplePrecisionError } from "@/lib/sample-precision";
import { getCachedCloudSamples } from "@/lib/cloud-samples";
import { loadTrips, saveTrips } from "@/lib/trips";
import { elevationFromCoordinates } from "@/lib/elevation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Droplet, Mountain, Sprout, ArrowLeft, Save, Camera, X, MapPin, Loader2, Plus, Mic, MicOff, Video, Image as ImageIcon, BookmarkCheck, FileQuestion } from "lucide-react";
import { useSamplesMutations } from "@/hooks/use-geofield";
import { useGetCurrentAuthUser, useGetFolders, useGetSample } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { enqueue, getQueue, updateQueuedSample } from "@/lib/offline-queue";
import { assertStorageAccount, getStorageAccountId } from "@/lib/storage-account";
import { storeMediaDataUrl, getStoredMediaDataUrl, type StoredMediaMetadata } from "@/lib/media-storage";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import { AirFields, BaseFields, WaterFields, RockFields, SoilFields } from "@/components/fields/SchemaForms";
import { cn } from "@/lib/utils";
import { SampleUTMEditor } from "@/components/SampleUTMEditor";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { SavePhotoButton } from "@/components/SavePhotoButton";
import { requireAccountForSave } from "@/lib/guest-access";

const sampleTypes = [
  { id: 'rock', label: 'Rock', icon: Mountain, color: 'text-[var(--color-rock)]', bg: 'bg-[var(--color-rock)]/10' },
  { id: 'water', label: 'Water', icon: Droplet, color: 'text-[var(--color-water)]', bg: 'bg-[var(--color-water)]/10' },
  { id: 'soil_sand', label: 'Soil/Sediment', icon: Sprout, color: 'text-[var(--color-soil)]', bg: 'bg-[var(--color-soil)]/10' },
  { id: 'other', label: 'Other', icon: FileQuestion, color: 'text-muted-foreground', bg: 'bg-muted' },
] as const;

const formSchema = z.object({
  sampleType: z.enum(['water', 'rock', 'soil_sand', 'air', 'other']),
  sampleId: z.string().min(1, "Sample ID is required"),
  folderId: z.string().optional(),
  notes: z.string().optional(),
  fields: z.record(z.any()),
});

type FormValues = z.infer<typeof formSchema>;
type GpsStatus = "idle" | "loading" | "success" | "error" | "denied";
type SampleTypeId = 'water' | 'rock' | 'soil_sand' | 'air' | 'other';

type MediaSlot = {
  type: "photo" | "video";
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  stored?: StoredMediaMetadata;
  caption?: string;
} | null;

interface CustomParam {
  id: string;
  label: string;
  value: string;
}

const TEMPLATE_KEY = "geofield_custom_param_templates";

type SheetTemplate = { labels: string[]; customIds?: string[]; basicOrder?: string[]; parameterOrder?: string[] };
function loadTemplates(): Partial<Record<SampleTypeId, SheetTemplate>> {
  try {
    const stored = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}");
    return Object.fromEntries(Object.entries(stored).map(([key, value]: [string, any]) => [key,
      Array.isArray(value) ? { labels: value.filter(v => typeof v === "string") } : {
        labels: Array.isArray(value?.labels) ? value.labels.filter((v: unknown) => typeof v === "string") : [],
        customIds: Array.isArray(value?.customIds) ? value.customIds : undefined,
        basicOrder: Array.isArray(value?.basicOrder) ? value.basicOrder : [],
        parameterOrder: Array.isArray(value?.parameterOrder) ? value.parameterOrder : [],
      }
    ]));
  } catch { return {}; }
}

function saveTemplate(type: SampleTypeId, template: SheetTemplate) {
  const all = loadTemplates();
  all[type] = template;
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all));
}

function templateToParams(labels: string[], ids?: string[]): CustomParam[] {
  return labels.map((label, index) => ({ id: ids?.[index] || `tpl_${crypto.randomUUID()}`, label, value: "" }));
}

function getTypeLabel(type: string) {
  if (type === "water") return "Water";
  if (type === "rock") return "Rock";
  if (type === "soil_sand") return "Soil/Sediment";
  if (type === "air") return "Air";
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
        if (m?.dataUrl?.startsWith("data:") && m?.type && !m?.storageKey) return { type: m.type as "photo" | "video", dataUrl: m.dataUrl, caption: m.caption };
        if (m?.storageKey) {
          const dataUrl = await getStoredMediaDataUrl(m.localKey || m.storageKey).catch(() => null);
          if (dataUrl) {
            return {
              type: (m.kind || m.type) as "photo" | "video",
              dataUrl,
              fileName: m.fileName,
              mimeType: m.mimeType,
              sizeBytes: m.sizeBytes,
              stored: m as StoredMediaMetadata,
              caption: m.caption,
            };
          }
        }
        if (m?.cloudUrl && (m?.kind || m?.type)) {
          return { type: (m.kind || m.type) as "photo" | "video", dataUrl: m.cloudUrl, stored: m, caption: m.caption };
        }
        return m?.storageKey ? { type: (m.kind || m.type) as "photo" | "video", dataUrl: "", stored: m, caption: m.caption } : null;
      })
    );
    while (loaded.length < 3) loaded.push(null);
    return loaded as [MediaSlot, MediaSlot, MediaSlot];
  }

  if (fields.photo) return [{ type: "photo", dataUrl: fields.photo, caption: fields.photoCaption }, null, null];
  return empty;
}

export default function SampleEntry() {
  const [location, setLocation] = useLocation();
  const { id } = useParams();
  const isEdit = Boolean(id && id !== "new");
  const queuedAtOpen = useMemo(() => getQueue().find((item) => (item.queuedId === id || item.targetId === id)), [id]);
  const isOfflineEdit = Boolean(queuedAtOpen);
  const sampleLookupId = isEdit && !isOfflineEdit && id ? id : "";
  const search = useSearch();
  const originProjectId = new URLSearchParams(search).get("folderId") || "";
  const initialFolderId = !isEdit ? originProjectId : "";
  const goBack = useBackNavigation();
  const leaveSample = () => {
    const projects = getLocalDatasets(true);
    const original = projects.find(project => String(project.id) === originProjectId || project.cloudId === originProjectId);
    const target = originProjectId && !original?.deletedAt ? resolveDatasetId(originProjectId, projects) : null;
    goBack(target ? `/dataset/${encodeURIComponent(String(target))}` : "/");
  };
  const { toast } = useToast();
  const { data: authData } = useGetCurrentAuthUser();
  const draftAccount = useRef<string | null>(getStorageAccountId());
  if (!draftAccount.current && authData?.user?.id) draftAccount.current = String(authData.user.id);

  const { data: remoteSample, isLoading: loadingSample } = useGetSample(sampleLookupId, {
    query: { enabled: isEdit && !isOfflineEdit && Boolean(id) }
  });
  const cachedSample = useMemo(() => getCachedCloudSamples().find((sample) => String(sample.id) === id), [id]);
  const existingSample = remoteSample ?? cachedSample;
  const { data: folders } = useGetFolders();
  const { createSample, updateSample } = useSamplesMutations();
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets.map(dataset => ({ ...dataset, id: dataset.cloudId || dataset.id }))];

  const [mediaSlots, setMediaSlots] = useState<[MediaSlot, MediaSlot, MediaSlot]>([null, null, null]);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [customParams, setCustomParams] = useState<CustomParam[]>([]);
  const [basicOrder, setBasicOrder] = useState<string[]>([]);
  const [parameterOrder, setParameterOrder] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState(isEdit);
  const initializedSample = useRef<string | undefined>(undefined);
  const sampleBaseline = useRef<typeof existingSample>(undefined);
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

  const { register, handleSubmit, watch, setValue, getValues, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sampleType: 'rock',
      sampleId: '',
      folderId: initialFolderId,
      notes: '',
      fields: {}
    }
  });

  useEffect(() => {
    if (!isEdit && initialFolderId) setValue("folderId", initialFolderId);
  }, [initialFolderId, isEdit, setValue]);

  const selectedDataset = watch("folderId");
  useEffect(() => {
    const synced = localDatasets.find(dataset => String(dataset.id) === selectedDataset)?.cloudId;
    if (synced) setValue("folderId", synced, { shouldDirty: true });
  }, [localDatasets, selectedDataset, setValue]);

  const gpsRequest = useRef(0);
  const elevationEditRevision = useRef(0);
  useEffect(() => () => { gpsRequest.current++; }, [id]);

  const captureGps = useCallback(async () => {
    const request = ++gpsRequest.current;
    const originalLocation = getValues("fields.location");
    const elevationRevision = elevationEditRevision.current;
    const account = getStorageAccountId();
    setGpsStatus("loading");
    try {
      const { coords } = await getAccuratePosition();
      if (request !== gpsRequest.current || account !== getStorageAccountId()) return;
      if (getValues("fields.location") !== originalLocation) { setGpsStatus("idle"); return; }
      setValue("fields.location", `${coords.latitude.toFixed(7)}, ${coords.longitude.toFixed(7)}`, { shouldDirty: true });
      if (Number.isFinite(coords.accuracy)) setValue("fields.gpsAccuracy", Math.round(coords.accuracy!), { shouldDirty: true });
      const height = elevationFromCoordinates(coords);
      if (elevationRevision === elevationEditRevision.current) {
        setValue("fields.elevation", height.elevation, { shouldDirty: true });
        setValue("fields.altitude", height.elevation, { shouldDirty: true });
        setValue("fields.elevationAccuracy", height.elevationAccuracy, { shouldDirty: true });
      }
      setGpsStatus("success");
      if (height.elevation === null && elevationRevision === elevationEditRevision.current) toast({ title: "GPS elevation unavailable", description: "The phone supplied coordinates but no altitude. Enter elevation manually or try GPS again with a clear view of the sky." });
    } catch (error: any) {
      if (request !== gpsRequest.current || account !== getStorageAccountId()) return;
      console.error("[GeoField GPS] Location capture failed", error);
      const denied = error?.code === 1 || /denied|permission/i.test(error?.message || "");
      setGpsStatus(denied ? "denied" : "error");
      toast({
        title: denied ? "Location permission required" : "GPS unavailable",
        description: denied
          ? "Allow location access for GeoField in your device Settings, then tap Try GPS Again."
          : error?.message === "GPS_TIMEOUT" ? "No GPS fix arrived within 15 seconds. Check Location Services and try again." : "Check Location Services and try again.",
        variant: "destructive",
      });
    }
  }, [getValues, setValue, toast]);

  useEffect(() => {
    if (isEdit) return;
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setValue("fields.collectionDate", local);

    captureGps();
  }, [captureGps, isEdit, setValue]);

  useEffect(() => {
    if (!isOfflineEdit || !id) return;
    const queued = queuedAtOpen;
    if (!queued) return;
    initializedSample.current = id;
    const fields = queued.payload.fields || {};
    reset({
      sampleType: queued.payload.sampleType as any,
      sampleId: queued.payload.sampleId,
      folderId: queued.payload.folderId ? String(queued.payload.folderId) : '',
      notes: queued.payload.notes || '',
      fields: { ...fields, photo: undefined, media: undefined, customParams: undefined },
    });
    if (Array.isArray(fields.customParams)) {
      setCustomParams(restoreCustomParameterIds(fields.customParams, loadTemplates()[queued.payload.sampleType as SampleTypeId]));
    }
    setIsLoadingMedia(true);
    hydrateMediaSlots(fields).then((slots) => { if (initializedSample.current === id && getStorageAccountId() === draftAccount.current) { setMediaSlots(slots); setIsLoadingMedia(false); } }).catch(() => { if (initializedSample.current === id && getStorageAccountId() === draftAccount.current) toast({ title: "Could not load sample photos", description: "Keep this sheet open and try again before saving.", variant: "destructive" }); });
  }, [isOfflineEdit, id, reset]);

  useEffect(() => {
    if (existingSample && isEdit && !isOfflineEdit && initializedSample.current !== id) {
      initializedSample.current = id;
      sampleBaseline.current = existingSample;
      const fields = existingSample.fields as Record<string, any> || {};
      setIsLoadingMedia(true);
      hydrateMediaSlots(fields).then((slots) => { if (initializedSample.current === id && getStorageAccountId() === draftAccount.current) { setMediaSlots(slots); setIsLoadingMedia(false); } }).catch(() => { if (initializedSample.current === id && getStorageAccountId() === draftAccount.current) toast({ title: "Could not load sample photos", description: "Keep this sheet open and try again before saving.", variant: "destructive" }); });
      if (Array.isArray(fields.customParams)) {
        setCustomParams(restoreCustomParameterIds(fields.customParams, loadTemplates()[existingSample.sampleType as SampleTypeId]));
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
  const isPending = isSubmitting || createSample.isPending || updateSample.isPending || isSavingMedia || isLoadingMedia;

  useEffect(() => {
    const template = loadTemplates()[currentType as SampleTypeId];
    setBasicOrder(template?.basicOrder ?? []);
    setParameterOrder(template?.parameterOrder ?? []);
  }, [currentType, id]);

  const prevTypeRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEdit) return;
    if (prevTypeRef.current === currentType) return;
    prevTypeRef.current = currentType;
    const templates = loadTemplates();
    const labels = templates[currentType as SampleTypeId]?.labels ?? [];
    if (labels.length > 0) setCustomParams(templateToParams(labels, templates[currentType as SampleTypeId]?.customIds));
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
    await saveMediaFile(file, activeSlotRef.current, e.target === photoCaptureInputRef.current);
  };
  const saveMediaFile = async (file: File, slotIndex: number, camera = false) => {
    const location = camera ? capturePhotoLocation() : Promise.resolve(null);
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
        setSlot({ type: "photo", dataUrl: withPhotoLocation(await preservePhotoDirection(await compressImage(file), file), await location), fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      } catch {
        const reader = new FileReader();
        reader.onload = (ev) => setSlot({ type: "photo", dataUrl: ev.target?.result as string, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
        reader.readAsDataURL(file);
      }
    }
  };

  const openSlot = (index: number, source: "library" | "camera" | "video" = "library") => {
    activeSlotRef.current = index;
    if (source === "camera") void capturePhoto(() => photoCaptureInputRef.current?.click(), file => saveMediaFile(file, index), message => toast({ title: message, variant: "destructive" }));
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
      if (slot.stored) return { ...slot.stored, caption: slot.caption ?? slot.stored.caption };
      const stored = { ...await storeMediaDataUrl({ kind: slot.type, dataUrl: slot.dataUrl, fileName: slot.fileName, mimeType: slot.mimeType }), caption: slot.caption };
      // If saving the sheet later fails, retry with these verified bytes rather
      // than writing another full copy of each photo/video to the device.
      setMediaSlots(current => current.map(item => item === slot ? { ...slot, stored } : item) as [MediaSlot, MediaSlot, MediaSlot]);
      return stored;
    }));
  }

  const toggleRecording = async () => {
    if (isRecording) {
      await recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const available = await SpeechRecognition.available();
        if (!available.available) throw new Error("Speech recognition is not available on this device.");

        let permission = await SpeechRecognition.checkPermissions();
        if (permission.speechRecognition !== "granted") permission = await SpeechRecognition.requestPermissions();
        if (permission.speechRecognition !== "granted") {
          throw new Error("Microphone and speech recognition access are required. Enable them for GeoField in iPhone Settings.");
        }

        const originalNotes = (document.getElementById("notes") as HTMLTextAreaElement)?.value ?? "";
        const applyTranscript = (transcript: string) => {
          const spoken = transcript.trim();
          const joined = originalNotes.trim() && spoken ? `${originalNotes.trimEnd()} ${spoken}` : originalNotes || spoken;
          setValue("notes", joined, { shouldDirty: true, shouldTouch: true });
        };
        const partialHandle = await SpeechRecognition.addListener("partialResults", ({ matches }) => {
          if (matches?.[0]) applyTranscript(matches[0]);
        });
        const stateHandle = await SpeechRecognition.addListener("listeningState", ({ status }) => {
          if (status === "stopped") {
            setIsRecording(false);
            recognitionRef.current = null;
            void partialHandle.remove();
            void stateHandle.remove();
          }
        });
        recognitionRef.current = {
          stop: async () => {
            await SpeechRecognition.stop();
            await partialHandle.remove();
            await stateHandle.remove();
          },
        };
        setIsRecording(true);
        await SpeechRecognition.start({ language: "en-US", maxResults: 1, partialResults: true, popup: false });
      } catch (error: any) {
        recognitionRef.current = null;
        setIsRecording(false);
        await SpeechRecognition.removeAllListeners().catch(() => undefined);
        toast({ title: "Dictation unavailable", description: error?.message || "GeoField could not start speech recognition.", variant: "destructive" });
      }
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Dictation unavailable", description: "Speech recognition is not supported in this browser.", variant: "destructive" });
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
      setValue("notes", joined, { shouldDirty: true, shouldTouch: true });
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const addCustomParam = () => setCustomParams((prev) => [...prev, { id: `cp_${crypto.randomUUID()}`, label: "", value: "" }]);
  const updateCustomParam = (id: string, field: "label" | "value", val: string) =>
    setCustomParams((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  const removeCustomParam = (id: string) => setCustomParams((prev) => prev.filter((p) => p.id !== id));

  const saveAsDefault = () => {
    const namedParams = customParams.filter(p => p.label.trim());
    const labels = namedParams.map(p => p.label);
    try { saveTemplate(currentType as SampleTypeId, { labels, customIds: namedParams.map(p => p.id), basicOrder, parameterOrder }); }
    catch {
      toast({ title: "Default could not be saved", description: "Your current sheet is unchanged. Free device storage and try again.", variant: "destructive" });
      return;
    }
    toast({
      title: "Template saved",
      description: `Parameter order and custom parameters saved for all existing and future ${getTypeLabel(currentType)} sheets on this device.`,
    });
  };

  const onSubmit = async (data: FormValues) => {
    if (!requireAccountForSave(authData?.user, setLocation, location)) return;
    const savingAccountId = draftAccount.current;
    if (isLoadingMedia || (isEdit && initializedSample.current !== id)) {
      toast({ title: "Sample is still loading", description: "Wait for the saved sample and attachments before saving changes.", variant: "destructive" });
      return;
    }
    const invalidParameter = findSamplePrecisionError(data.fields, customParams);
    if (invalidParameter) {
      toast({
        title: "Too many decimal places",
        description: `“${invalidParameter}” has more than 7 digits after the decimal point. Shorten that parameter value and try again. GPS coordinates and elevation do not need to be changed.`,
        variant: "destructive",
      });
      return;
    }

    const processedFields: Record<string, any> = {};
    Object.entries(data.fields).forEach(([k, v]) => {
      if (v === "") { processedFields[k] = ""; return; }
      const num = Number(v);
      processedFields[k] = Number.isFinite(num) && typeof v === "string" && v.trim() !== "" ? num : v;
    });

    const plannedSiteId = typeof data.fields.plannedSiteId === "string" ? data.fields.plannedSiteId : null;
    if (plannedSiteId && data.fields.collectionStatus === "planned") {
      const collectedAt = new Date().toISOString();
      processedFields.collectionStatus = "collected";
      processedFields.collectedAt = collectedAt;

    }

    const originalMedia = (queuedAtOpen?.payload.fields ?? sampleBaseline.current?.fields as any)?.media;
    const filledSlots = mediaSlots.some(Boolean) || (Array.isArray(originalMedia) && originalMedia.length > 3);
    if (filledSlots) {
      try {
        setIsSavingMedia(true);
        const storedMedia = [...await prepareMediaForSave(mediaSlots), ...(Array.isArray(originalMedia) ? originalMedia.slice(3) : [])];
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
    const payload = {
      sampleType: data.sampleType,
      sampleId: data.sampleId,
      folderId,
      notes: data.notes,
      fields: { ...((sampleBaseline.current?.fields as Record<string, any>) ?? {}), ...processedFields, customParams: processedFields.customParams ?? [], media: processedFields.media ?? [], photoCount: processedFields.photoCount ?? 0, videoCount: processedFields.videoCount ?? 0, primaryPhoto: processedFields.primaryPhoto ?? null },
    };

    try {
      if (!isEdit && data.sampleType === "air") {
        toast({ title: "Air samples are read-only", variant: "destructive" });
        return;
      }
      assertStorageAccount(savingAccountId);
      if (isOfflineEdit && queuedAtOpen) updateQueuedSample(queuedAtOpen.queuedId, payload, queuedAtOpen);
      else {
        const cached = isEdit && id ? getCachedCloudSamples().find(sample => String(sample.id) === id) : undefined;
        const baseline = cached && sampleBaseline.current && sameSampleAfterUpload(cached, sampleBaseline.current)
          ? cached.updatedAt : sampleBaseline.current?.updatedAt;
        enqueue(payload, isEdit && id ? id : undefined, baseline);
      }
      // Update the trip only after the complete sample is durable.
      if (plannedSiteId && processedFields.collectedAt) try {
        const collectedAt = processedFields.collectedAt;
        const trips = loadTrips();
        const updatedTrips = trips.map((trip: any) => ({
          ...trip,
          sites: Array.isArray(trip.sites) ? trip.sites.map((site: any) => site.id === plannedSiteId ? { ...site, collectedAt } : site) : [],
          updatedAt: trip.sites?.some((site: any) => site.id === plannedSiteId) ? collectedAt : trip.updatedAt,
        }));
        saveTrips(updatedTrips);
        window.dispatchEvent(new CustomEvent("trips-updated"));
      } catch {
        toast({ title: "Sample saved; trip update pending", description: "The sample is safe. Reopen the trip after syncing to refresh its collection status." });
      }
      toast({ title: "Sample saved", description: "Saved on this device. Changes and photos will sync when connected." });
      leaveSample();
    } catch (error) {
      toast({ title: "Sample could not be saved", description: error instanceof Error ? error.message : "Keep this page open and try again.", variant: "destructive" });
    }

  };

  if (isEdit && !isOfflineEdit && loadingSample && !existingSample) return (
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
        <Button variant="ghost" size="icon" onClick={leaveSample} className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-3xl font-bold font-display">{isEdit ? "Edit Sample" : "New Field Sample"}</h1>
          <p className="text-muted-foreground mt-1">Record accurate parameter data directly from the field.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-20">
        <div className="space-y-3">
          <Label className="text-base">Sample Type</Label>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {sampleTypes.map((type) => {
              const isSelected = currentType === type.id;
              const Icon = type.icon;
              return (
                <button type="button" key={type.id} disabled={isEdit} aria-pressed={isSelected} onClick={() => setValue("sampleType", type.id, { shouldValidate: true })} className={cn("relative overflow-hidden rounded-xl border p-4 text-left cursor-pointer transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", isSelected ? "border-primary ring-2 ring-primary/20 shadow-md bg-card" : isEdit ? "opacity-50 cursor-not-allowed bg-muted/50 border-transparent" : "border-border bg-card hover:border-primary/50 hover:shadow-sm")}>
                  {isSelected && <span className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />}
                  <span className="flex items-center gap-4 relative z-10"><span className={cn("p-3 rounded-lg", type.bg, type.color)}><Icon className="w-6 h-6" /></span><span className="font-semibold text-lg">{type.label}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="overflow-hidden shadow-lg border-border/50">
          <div className="p-6 md:p-8 space-y-8 bg-gradient-to-b from-card to-muted/20">
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>Basic Information{!isEdit && (<span className={cn("ml-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium", gpsStatus === "loading" && "bg-yellow-100 text-yellow-700", gpsStatus === "success" && "bg-green-100 text-green-700", (gpsStatus === "error" || gpsStatus === "denied") && "bg-red-100 text-red-600", gpsStatus === "idle" && "bg-muted text-muted-foreground")}>{gpsStatus === "loading" && <><Loader2 className="w-3 h-3 animate-spin" />Getting GPS...</>}{gpsStatus === "success" && <><MapPin className="w-3 h-3" />GPS captured</>}{gpsStatus === "denied" && <><MapPin className="w-3 h-3" />Location denied</>}{gpsStatus === "error" && <><MapPin className="w-3 h-3" />GPS unavailable</>}</span>)}</h3>
              <BaseFields locationAction={<PlacePointButton location={locationValue || ""} onSave={point => {
                gpsRequest.current++;
                elevationEditRevision.current++;
                setGpsStatus("idle");
                setValue("fields.location", `${point.latitude.toFixed(7)}, ${point.longitude.toFixed(7)}`, { shouldDirty: true, shouldValidate: true });
                setValue("fields.gpsAccuracy", null, { shouldDirty: true });
                setValue("fields.elevation", point.elevation, { shouldDirty: true });
                setValue("fields.altitude", point.elevation, { shouldDirty: true });
                setValue("fields.elevationAccuracy", null, { shouldDirty: true });
              }} />} collectionDate={watch("fields.collectionDate")} onCollectionDateChange={(value: string) => setValue("fields.collectionDate", value, { shouldDirty: true })} register={register} errors={errors} order={basicOrder} onOrderChange={setBasicOrder} />
              {Number.isFinite(watch("fields.gpsAccuracy")) && <p className="text-sm text-muted-foreground">GPS estimated accuracy: ±{watch("fields.gpsAccuracy")} m. For a better fix, stay still with a clear view of the sky and enable Precise Location.</p>}
              {(
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={gpsStatus === "loading"} onClick={captureGps}>
                  <MapPin className="h-4 w-4" />{gpsStatus === "loading" ? "Improving GPS…" : "Refresh GPS at current position"}
                </Button>
              )}
              <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Elevation (m)</p>
                <ElevationInput value={watch("fields.elevation") ?? watch("fields.altitude")} accuracy={watch("fields.elevationAccuracy")} onChange={value => {
                  elevationEditRevision.current++;
                  setValue("fields.elevation", value, { shouldDirty: true });
                  setValue("fields.altitude", value, { shouldDirty: true });
                  setValue("fields.elevationAccuracy", null, { shouldDirty: true });
                }} />
              </div>
              <SampleUTMEditor onEdit={() => { gpsRequest.current++; setGpsStatus("idle"); }} location={locationValue} onChange={value => setValue("fields.location", value, { shouldDirty: true, shouldValidate: true })} />
            </div>

            <div className="h-px bg-border/60 w-full" />
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-display font-semibold">Parameters</h3>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={saveAsDefault}><BookmarkCheck className="w-4 h-4 mr-2" />Set as default</Button>
                  <Button type="button" variant="outline" size="sm" onClick={addCustomParam}><Plus className="w-4 h-4 mr-2" />Add Parameter</Button>
                </div>
              </div>
              {(() => {
                const extraFields = customParams.map(param => <div key={param.id} className="space-y-2">
                  <div className="flex gap-2">
                    <Input aria-label="Custom parameter name" value={param.label} onChange={e => updateCustomParam(param.id, "label", e.target.value)} placeholder="Parameter name" />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${param.label || "custom parameter"}`} onClick={() => removeCustomParam(param.id)}><X className="w-4 h-4" /></Button>
                  </div>
                  <Input aria-label={`${param.label || "Custom parameter"} value`} value={param.value} onChange={e => updateCustomParam(param.id, "value", e.target.value)} placeholder="Value (e.g. 7.2, Present, 42 mg/L)" />
                </div>);
                const props = { register, order: parameterOrder, onOrderChange: setParameterOrder, extraFields };
                if (currentType === "water") return <WaterFields {...props} />;
                if (currentType === "rock") return <RockFields {...props} />;
                if (currentType === "soil_sand") return <SoilFields {...props} />;
                if (currentType === "air") return <AirFields {...props} />;
                return <OrderedFields {...props} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div key="otherSampleTitle" className="space-y-2">
                    <Label htmlFor="other-sample-title">Sample Type</Label>
                    <Input id="other-sample-title" {...register("fields.otherSampleTitle")} placeholder="e.g. Vegetation, Ice, Biological material" />
                  </div>
                </OrderedFields>;
              })()}
            </div>

            <div className="h-px bg-border/60 w-full" />

            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">4</span>Photos &amp; Video</h3>
              <p className="text-xs text-muted-foreground -mt-1">Videos have a 10-second maximum.</p>
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
                              <LabeledPhoto key={slot.dataUrl} src={slot.dataUrl} initiallyOpen={new URLSearchParams(window.location.search).get("photo") === String(i)} initiallyRead={new URLSearchParams(window.location.search).get("label") === "read"} alt={`Sample photo ${i + 1}`} caption={slot.caption} onEdit={async dataUrl => {
                                setMediaSlots(previous => {
                                  if (previous[i]?.dataUrl !== slot.dataUrl) return previous;
                                  const next = [...previous] as [MediaSlot, MediaSlot, MediaSlot];
                                  next[i] = { type: "photo", dataUrl, fileName: "edited-photo.jpg", mimeType: "image/jpeg", caption: previous[i]?.caption };
                                  return next;
                                });
                                toast({ title: "Photo edited", description: "Save the sample to keep your edited picture." });
                              }} className="w-36 h-36 object-cover" saveMessage="Label added. Save the sample to keep your changes." onSave={caption => setMediaSlots(previous => {
                                if (previous[i]?.dataUrl !== slot.dataUrl) return previous;
                                const next = [...previous] as [MediaSlot, MediaSlot, MediaSlot];
                                next[i] = { ...previous[i]!, caption }; return next;
                              })} />
                            ) : (
                              <video src={slot.dataUrl} className="w-36 h-36 object-cover rounded-xl border border-border shadow-md cursor-pointer bg-black" controls playsInline onClick={(e) => e.stopPropagation()} />
                            )}
                            <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 flex items-center gap-1 pointer-events-none">
                              {slot.type === "photo" ? <ImageIcon className="w-2.5 h-2.5" /> : <Video className="w-2.5 h-2.5" />}
                              {slot.type === "photo" ? "Photo" : "Video"}
                            </span>
                            <button type="button" onClick={() => clearSlot(i)} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"><X className="w-3.5 h-3.5" /></button>
                            {slot.type === "photo" && <button type="button" className="mt-1 block text-xs text-primary underline" onClick={() => openSlot(i)}>Replace photo</button>}
                            {slot.type === "photo" && <SavePhotoButton src={slot.dataUrl} fileName={slot.fileName || `geofield-${getTypeLabel(currentType).toLowerCase()}-${i + 1}`} />}

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="folderId">Project (Optional)</Label><Button type="button" variant="outline" size="sm" onClick={() => setDatasetDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />New Project</Button></div><select id="folderId" className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" {...register("folderId")}><option value="">Uncategorized</option>{allFolders.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="space-y-2 md:col-span-2"><div className="flex items-center justify-between"><Label htmlFor="notes">Field Notes</Label><button type="button" onClick={toggleRecording} title={isRecording ? "Stop recording" : "Dictate field notes"} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all", isRecording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50")}>{isRecording ? <><MicOff className="w-3.5 h-3.5" /> Stop</> : <><Mic className="w-3.5 h-3.5" /> Dictate</>}</button></div>{isRecording && <p className="text-xs text-red-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />Listening… speak your field notes now.</p>}<Textarea id="notes" placeholder="Additional observations, weather conditions, context... or click Dictate to speak." className="min-h-[120px]" {...register("notes")} /></div></div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-4 sticky bottom-6 z-20"><Button type="button" variant="outline" size="lg" className="bg-background shadow-md" onClick={leaveSample}>Cancel</Button><Button type="submit" size="lg" disabled={isPending} className="shadow-xl"><Save className="w-5 h-5 mr-2" />{isPending ? "Saving..." : isEdit ? "Update Sample" : "Save Sample"}</Button></div>
      </form>
      <FolderDialog open={datasetDialogOpen} onOpenChange={setDatasetDialogOpen} onCreated={dataset => {
        setLocalDatasets(getLocalDatasets());
        setValue("folderId", String(dataset.id), { shouldDirty: true });
      }} />
    </Layout>
  );
}
