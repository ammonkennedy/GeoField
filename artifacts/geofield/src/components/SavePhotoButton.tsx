import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { savePhoto } from "@/lib/save-photo";
import { cn } from "@/lib/utils";

function photoFileName(requestedName: string | undefined, mimeType: string) {
  const clean = (requestedName || "geofield-photo")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  const baseName = clean.replace(/\.[a-z0-9]{2,5}$/i, "");
  const extension = ({ "image/png": "png", "image/heic": "heic", "image/heif": "heif", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/tiff": "tiff" } as Record<string, string>)[mimeType.toLowerCase().split(";")[0]] || "jpg";
  return `${baseName || "geofield-photo"}.${extension}`;
}

export function SavePhotoButton({
  src,
  fileName,
  className,
  showLabel = false,
}: {
  src: string;
  fileName?: string;
  className?: string;
  showLabel?: boolean;
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
      const result = await savePhoto(blob, photoFileName(fileName, blob.type));
      toast({
        title: result === "photos" ? "Saved to Photos" : result === "shared" ? "Photo ready to save" : "Download started",
        description: result === "photos" ? "The picture is now in your photo library." : result === "shared"
          ? "Choose Save Image in the iPhone share menu to add it to Photos."
          : "Your browser will save the picture to your chosen download location.",
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
        showLabel ? "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-70" : "absolute bottom-2 right-2 z-20 flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70",
        className,
  showLabel = false,
      )}
      aria-label="Download photo"
      title="Download photo"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {showLabel && (saving ? "Saving…" : "Download")}
    </button>
  );
}
