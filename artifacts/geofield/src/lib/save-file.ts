import { Capacitor } from "@capacitor/core";

export type SaveFileResult = "shared" | "downloaded";

/**
 * Browser download attributes are ignored by WKWebView in some Capacitor/iOS
 * versions. Use the native share sheet for installed builds and retain normal
 * downloads for the web app.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveFileResult> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

  if (Capacitor.isNativePlatform() && typeof navigator.share === "function") {
    const canShare = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
    if (canShare) {
      await navigator.share({ files: [file], title: filename });
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
