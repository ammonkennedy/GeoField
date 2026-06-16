import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useGetSamples, useGetFolders } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Search, Edit2, Trash2, FolderOpen, MapPin, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSamplesMutations, useFoldersMutations } from "@/hooks/use-geofield";
import { ExportDialog } from "@/components/ExportDialog";
import { DatasetFigures } from "@/components/DatasetFigures";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";

const typeStyles = {
  water: { label: 'Water', variant: 'water' as const },
  rock: { label: 'Rock', variant: 'rock' as const },
  soil_sand: { label: 'Soil', variant: 'soil' as const },
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { folderId } = useParams();
  const folderIdNum = folderId ? Number(folderId) : undefined;
  
  const { data: samples, isLoading } = useGetSamples(folderIdNum ? { folderId: folderIdNum } : undefined);
  const { data: folders } = useGetFolders();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  
  const { deleteSample } = useSamplesMutations();
  const { deleteFolder } = useFoldersMutations();

  const activeFolder = folders?.find(f => f.id === folderIdNum);

  const localSamples = JSON.parse(localStorage.getItem("geofield-offline-queue") || "[]");
  const allSamples = [...(samples || []), ...localSamples.map((item: any, index: number) => ({ id: -index - 1, ...(item.data || item), sampleId: (item.data || item).sampleId || "Offline Sample" }))];
  
  const filteredSamples = allsamples.filter(s => 
    String(s.sampleId || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    String(s.notes || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(s.fields?.location || "").toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDeleteFolder = () => {
    if (activeFolder && confirm("Are you sure you want to delete this dataset? Samples will become uncategorized.")) {
      deleteFolder.mutate({ id: activeFolder.id }, {
        onSuccess: () => setLocation("/")
      });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-3">
            {activeFolder ? (
              <>
                <FolderOpen className="text-primary w-8 h-8" />
                {activeFolder.name}
              </>
            ) : "All Field Samples"}
          </h1>
          {activeFolder?.description && (
            <p className="text-muted-foreground mt-2 max-w-2xl">{activeFolder.description}</p>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {activeFolder && (
            <Button variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10" onClick={handleDeleteFolder}>
              Delete Dataset
            </Button>
          )}
          {activeFolder && filteredSamples.length > 0 && (
            <DatasetFigures samples={filteredSamples} datasetName={activeFolder.name} />
          )}
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
          <Button onClick={() => setLocation("/sample/new")}>
            <Plus className="w-4 h-4 mr-2" />
            New Sample
          </Button>
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input 
          placeholder="Search by ID, location, or notes..." 
          className="pl-10 h-12 text-base rounded-xl shadow-sm border-border/50"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" />)}
        </div>
      ) : filteredSamples.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSamples.map(sample => {
            const style = typeStyles[sample.sampleType as keyof typeof typeStyles] || typeStyles.rock;
            const folder = folders?.find(f => f.id === sample.folderId);
            const rawDate = sample.fields?.collectionDate as string || sample.createdAt;
            const date = rawDate ? new Date(rawDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
            const locationStr = sample.fields?.location as string;

            return (
              <Card 
                key={sample.id} 
                className="group hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col"
              >
                <div className="p-5 flex-1 cursor-pointer" onClick={() => setLocation(`/sample/${sample.id}`)}>
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant={style.variant} className="capitalize text-sm px-3 py-1">
                      {style.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded-md">
                      {sample.sampleId}
                    </span>
                  </div>
                  
                  <div className="space-y-3 mt-4">
                    <div className="flex items-center gap-2 text-sm text-foreground/80">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {date}
                    </div>
                    {locationStr && (
                      <div className="flex items-start gap-2 text-sm text-foreground/80">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{locationStr}</span>
                      </div>
                    )}
                    {folder && !activeFolder && (
                      <div className="flex items-center gap-2 text-sm text-foreground/80">
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{folder.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="border-t border-border/50 bg-muted/20 p-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => setLocation(`/sample/${sample.id}`)}>
                    <Edit2 className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(sample.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />

      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogHeader>
          <DialogTitle>Delete Sample</DialogTitle>
          <DialogClose onClick={() => setDeleteId(null)} />
        </DialogHeader>
        <DialogContent>
          <p className="py-4">Are you sure you want to permanently delete this sample? This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteId) {
                  deleteSample.mutate({ id: deleteId }, { onSuccess: () => setDeleteId(null) });
                }
              }}
              disabled={deleteSample.isPending}
            >
              {deleteSample.isPending ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
