import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useFoldersMutations } from "@/hooks/use-geofield";
import { Folder, useGetCurrentAuthUser } from "@workspace/api-client-react";
import { createLocalDataset, updateLocalDataset } from "@/lib/local-datasets";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { requireAccountForSave } from "@/lib/guest-access";

export function FolderDialog({ 
  open, 
  onOpenChange, 
  folder,
  onCreated,
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  folder?: Folder;
  onCreated?: (folder: { id: string | number; name: string }) => void;
}) {
  const [name, setName] = useState(folder?.name || "");
  const [description, setDescription] = useState(folder?.description || "");
  const { updateFolder } = useFoldersMutations();
  const { toast } = useToast();
  const { data: authData } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setName(folder?.name || "");
    setDescription(folder?.description || "");
  }, [folder, open]);

  const isPending = updateFolder.isPending;
  const useLocalDatasets = !navigator.onLine;

  const finish = () => {
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!requireAccountForSave(authData?.user, setLocation)) return;

    // Local datasets are what make the app usable before the backend folder API exists.
    if (folder && ((folder as any).isLocal || (typeof folder.id === "number" && folder.id < 0))) {
      try {
        updateLocalDataset(Number(folder.id), { name, description });
        toast({ title: "Dataset updated" });
        finish();
      } catch {
        toast({ title: "Dataset could not be saved", description: "Your changes are still here. Check device storage and try again.", variant: "destructive" });
      }
      return;
    }

    if (!folder) {
      try {
        const created = createLocalDataset({ name, description });
        onCreated?.(created);
      } catch {
        toast({ title: "Dataset could not be saved", description: "Check available device storage and try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Dataset created", description: "Saved locally on this device." });
      finish();
      return;
    }

    if (folder) {
      if (useLocalDatasets) {
        toast({ title: "Dataset rename needs a connection", description: "Your changes are still in this dialog. Reconnect and save again; no duplicate dataset has been created.", variant: "destructive" });
        return;
      }
      updateFolder.mutate({ 
        id: folder.id, 
        data: { name, description } 
      }, {
        onSuccess: () => onOpenChange(false),
        onError: () => toast({ title: "Dataset update is not confirmed", description: "Your changes are still here. Reconnect and try saving again.", variant: "destructive" })
      });

    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{folder ? "Edit Dataset" : "Create New Dataset"}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Dataset Name</Label>
            <Input 
              id="name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="e.g., Summer 2024 Field Trip"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea 
              id="description" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="Location details or project scope"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Saving..." : folder ? "Save Changes" : "Create Dataset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
