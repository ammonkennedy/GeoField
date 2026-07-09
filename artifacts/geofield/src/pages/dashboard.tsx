import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useGetSamples, useGetFolders } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Search, Edit2, Trash2, FolderOpen, MapPin, Calendar, Radio, Cloud, ShieldCheck, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSamplesMutations, useFoldersMutations } from "@/hooks/use-geofield";
import { ExportDialog } from "@/components/ExportDialog";
import { DatasetFigures } from "@/components/DatasetFigures";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { getQueue, removeFromQueue, QUEUE_UPDATED_EVENT } from "@/lib/offline-queue";
import { deleteLocalDataset, getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";

const typeStyles = {
  water: { label: "Water", variant: "water" as const },
  rock: { label: "Rock", variant: "rock" as const },
  soil_sand: { label: "Soil", variant: "soil" as const },
  air: { label: "Air", variant: "air" as const },
  other: { label: "Other", variant: "secondary" as const },
};

function getSampleTypeLabel(sample: any) {
  if (sample.sampleType === "other") {
    return sample.fields?.otherSampleTitle || sample.fields?.title || sample.sampleId || "Other";
  }
  return typeStyles[sample.sampleType as keyof typeof typeStyles]?.label || "Sample";
}

function parseRouteId(value?: string): string | number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { folderId } = useParams();
  const activeFolderId = parseRouteId(folderId);
  const isLocalFolder = typeof activeFolderId === "number" && activeFolderId < 0;
  const shouldLoadServerSamples = !isLocalFolder;

  const { data: samples, isLoading } = useGetSamples(shouldLoadServerSamples && activeFolderId ? { folderId: activeFolderId } : undefined);
  const { data: folders } = useGetFolders();

  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [queuedSamples, setQueuedSamples] = useState(getQueue);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);

  const { deleteSample } = useSamplesMutations();
  const { deleteFolder } = useFoldersMutations();

  useEffect(() => {
    const refreshQueue = () => setQueuedSamples(getQueue());
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshQueue);
    window.addEventListener("storage", refreshQueue);
    return () => {
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshQueue);
      window.removeEventListener("storage", refreshQueue);
    };
  }, []);

  useEffect(() => {
    const refreshDatasets = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
    window.addEventListener("storage", refreshDatasets);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
      window.removeEventListener("storage", refreshDatasets);
    };
  }, []);

  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];
  const activeFolder = allFolders.find((f: any) => String(f.id) === String(activeFolderId));

  const localSamples = queuedSamples
    .filter((item) => !activeFolderId || String(item.payload.folderId ?? "") === String(activeFolderId))
    .map((item, index) => ({
      id: item.queuedId,
      ...(item.payload || {}),
      sampleId: item.payload.sampleId || `offline-${index + 1}`,
      createdAt: item.queuedAt,
      isOffline: true,
    }));

  const serverSamples = isLocalFolder ? [] : (samples || []);
  const allSamples = [...serverSamples, ...localSamples];

  const filteredSamples = allSamples.filter((s: any) =>
    String(s.sampleId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(getSampleTypeLabel(s)).toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(s.notes || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(s.fields?.location || "").toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDeleteFolder = () => {
    if (!activeFolder || !confirm("Are you sure you want to delete this dataset? Samples will become uncategorized.")) return;

    if ((activeFolder as any).isLocal || (typeof activeFolder.id === "number" && activeFolder.id < 0)) {
      deleteLocalDataset(activeFolder.id as number);
      setLocation("/");
      return;
    }

    deleteFolder.mutate({ id: activeFolder.id }, {
      onSuccess: () => setLocation("/")
    });
  };

  const handleDeleteSample = () => {
    if (!deleteId) return;
    if (typeof deleteId === "string" && deleteId.startsWith("q_")) {
      removeFromQueue(deleteId);
      setDeleteId(null);
      return;
    }
    deleteSample.mutate({ id: deleteId }, { onSuccess: () => setDeleteId(null) });
  };

  const totalSamples = allSamples.length;
  const mappedSamples = allSamples.filter((sample: any) => sample.fields?.location).length;
  const pendingSamples = localSamples.length;
  const datasetCount = allFolders.length;
  const pageTitle = activeFolder ? activeFolder.name : "Field Samples";
  const pageSubtitle = activeFolder?.description || "Field data that's accurate, organized, and always with you.";

  return (
    <Layout>
      <div className="mb-8 overflow-hidden rounded-[28px] border border-slate-200 bg-card shadow-sm">
        <div className="border-b border-border/70 bg-gradient-to-br from-white via-white to-blue-50/70 px-5 py-6 md:px-7 md:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  <Radio className="h-3.5 w-3.5" /> GPS Accurate
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                  <Cloud className="h-3.5 w-3.5" /> Works Offline
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Syncs Securely
                </span>
              </div>
              <h1 className="flex items-center gap-3 text-3xl font-bold font-display md:text-4xl">
            {activeFolder ? (
              <>
                    <FolderOpen className="h-9 w-9 text-slate-950" />
                    {pageTitle}
              </>
                ) : pageTitle}
              </h1>
              <p className="mt-2 max-w-2xl text-base text-muted-foreground">{pageSubtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {activeFolder && (
                <Button variant="outline" className="border-destructive/20 text-destructive hover:bg-destructive/10" onClick={handleDeleteFolder}>
                  Delete Dataset
                </Button>
              )}
              {activeFolder && filteredSamples.length > 0 && (
                <DatasetFigures samples={filteredSamples as any} datasetName={activeFolder.name} />
              )}
              <Button variant="secondary" className="rounded-full bg-white shadow-sm" onClick={() => setExportOpen(true)}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button className="rounded-full bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800" onClick={() => setLocation("/sample/new")}>
                <Plus className="w-4 h-4 mr-2" />
                New Sample
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-border/70 md:grid-cols-4 md:divide-y-0">
          {[
            { label: "Samples", value: totalSamples, icon: Database },
            { label: "Mapped", value: mappedSamples, icon: MapPin },
            { label: "Datasets", value: datasetCount, icon: FolderOpen },
            { label: "Pending Sync", value: pendingSamples, icon: Cloud },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex items-center gap-3 px-5 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold leading-none">{stat.value}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          placeholder="Search by ID, location, or notes..."
          className="h-12 rounded-2xl border-border/80 bg-card pl-12 text-base shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading && shouldLoadServerSamples ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" />)}
        </div>
      ) : filteredSamples.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed bg-card/90 shadow-sm">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold">No samples found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            {searchTerm ? "Try adjusting your search terms." : "You haven't recorded any samples in this view yet."}
          </p>
          {!searchTerm && (
            <Button className="mt-6" onClick={() => setLocation("/sample/new")}>Record First Sample</Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredSamples.map((sample: any) => {
            const style = typeStyles[sample.sampleType as keyof typeof typeStyles] || typeStyles.rock;
            const folder = allFolders.find((f: any) => String(f.id) === String(sample.folderId));
            const rawDate = sample.fields?.collectionDate as string || sample.createdAt;
            const date = rawDate ? new Date(rawDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
            const locationStr = sample.fields?.location as string;

            return (
              <Card key={sample.id} className="group overflow-hidden border-border/80 bg-card shadow-sm hover:-translate-y-0.5 hover:shadow-xl hover:border-primary/30 transition-all duration-300 flex flex-col">
                <div className="h-1.5 bg-slate-950" />
                <div className="p-5 flex-1 cursor-pointer" onClick={() => setLocation(`/sample/${sample.id}`)}>
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <Badge variant={style.variant} className="capitalize text-sm px-3 py-1">
                      {getSampleTypeLabel(sample)}{sample.isOffline ? " · Offline" : ""}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded-md truncate">
                      {sample.sampleId}
                    </span>
                  </div>

                  <div className="space-y-3 mt-5">
                    <div className="flex items-center gap-2 text-sm text-foreground/80">
                      <Calendar className="w-4 h-4 text-primary" />
                      {date}
                    </div>
                    {locationStr && (
                      <div className="flex items-start gap-2 text-sm text-foreground/80">
                        <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{locationStr}</span>
                      </div>
                    )}
                    {folder && !activeFolder && (
                      <div className="flex items-center gap-2 text-sm text-foreground/80">
                        <FolderOpen className="w-4 h-4 text-primary" />
                        <span className="truncate">{folder.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/60 bg-slate-50/70 p-3 flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => setLocation(`/sample/${sample.id}`)}>
                    <Edit2 className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(sample.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} samples={allSamples} />

      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogHeader>
          <DialogTitle>Delete Sample</DialogTitle>
          <DialogClose onClick={() => setDeleteId(null)} />
        </DialogHeader>
        <DialogContent>
          <p className="py-4">Are you sure you want to permanently delete this sample? This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSample} disabled={deleteSample.isPending}>
              {deleteSample.isPending ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
