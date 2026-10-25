import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Folder, useGetCurrentAuthUser } from "@workspace/api-client-react";
import { createLocalDataset, updateLocalDataset, editCloudDatasetOffline } from "@/lib/local-datasets";
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
  const { toast } = useToast();
  const { data: authData } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setName(folder?.name || "");
    setDescription(folder?.description || "");
  }, [folder, open]);

  const isPending = false;

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
        toast({ title: "Project updated" });
        finish();
      } catch {
        toast({ title: "Project could not be saved", description: "Your changes are still here. Check device storage and try again.", variant: "destructive" });
      }
      return;
    }

    if (!folder) {
      try {
        const created = createLocalDataset({ name, description });
        onCreated?.(created);
      } catch {
        toast({ title: "Project could not be saved", description: "Check available device storage and try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Project created", description: "Saved locally on this device." });
      finish();
      return;
    }

    try {
      editCloudDatasetOffline(folder.id, { name, description });
      toast({ title: "Project updated", description: "Saved on this device and queued for sync." });
      finish();
    } catch (error) {
      toast({ title: "Project could not be saved", description: error instanceof Error ? error.message : "Your changes are still here. Please retry.", variant: "destructive" });
    }

  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{folder ? "Edit Project" : "Create New Project"}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
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
              {isPending ? "Saving..." : folder ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
