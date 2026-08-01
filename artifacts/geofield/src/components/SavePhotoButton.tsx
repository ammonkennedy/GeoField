import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { saveFile } from "@/lib/save-file";
import { cn } from "@/lib/utils";

function photoFileName(requestedName: string | undefined, mimeType: string) {
  const clean = (requestedName || "geofield-photo")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  const baseName = clean.replace(/\.[a-z0-9]{2,5}$/i, "");
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("heic") ? "heic" : "jpg";
  return `${baseName || "geofield-photo"}.${extension}`;
}

export function SavePhotoButton({
  src,
  fileName,
  className,
}: {
  src: string;
  fileName?: string;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("The photo could not be loaded.");
      const blob = await response.blob();
      const result = await saveFile(blob, photoFileName(fileName, blob.type));
      toast({
        title: result === "shared" ? "Photo ready to save" : "Photo saved",
        description: result === "shared"
          ? "Choose Save Image in the iPhone share menu to add it to Photos."
          : "The photo was downloaded to this device.",
      });
    } catch (error: any) {
      toast({
        title: "Could not save photo",
        description: error?.message || "Try opening the photo again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      className={cn(
        "absolute bottom-2 right-2 z-20 flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70",
        className,
      )}
      aria-label="Save photo to camera roll"
      title="Save photo to camera roll"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </button>
  );
}
