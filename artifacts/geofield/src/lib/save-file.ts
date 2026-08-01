import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";

export type SaveFileResult = "shared" | "downloaded";

export interface SaveFileOptions {
  previewAfterSave?: boolean;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function stageNativePreview(blob: Blob, filename: string) {
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, "-");
  return Filesystem.writeFile({
    path: `export-previews/${Date.now()}-${safeName}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
}

/**
 * Browser download attributes are ignored by WKWebView in some Capacitor/iOS
 * versions. Use the native share sheet for installed builds, optionally
 * followed by a native Quick Look preview, and retain normal downloads for web.
 */
export async function saveFile(blob: Blob, filename: string, options: SaveFileOptions = {}): Promise<SaveFileResult> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

  if (Capacitor.isNativePlatform() && typeof navigator.share === "function") {
    const canShare = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
    if (canShare) {
      const previewFile = options.previewAfterSave
        ? await stageNativePreview(blob, filename).catch((error) => {
            console.warn("[GeoField export] Could not prepare native preview", error);
            return null;
          })
        : null;
      await navigator.share({ files: [file], title: filename });
      if (previewFile) {
        await FileOpener.open({
          filePath: previewFile.uri,
          contentType: blob.type || "application/octet-stream",
          openWithDefault: true,
        }).catch((error) => {
          // The export has already succeeded. A preview failure must not turn a
          // saved file into an apparent export failure.
          console.warn("[GeoField export] Could not open native preview", error);
        });
      }
      return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return "downloaded";
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
