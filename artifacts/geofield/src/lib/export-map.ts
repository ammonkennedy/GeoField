import type { Map as MapLibreMap } from "maplibre-gl";

/** Copy the map pixels directly, then composite DOM markers and attribution. */
export async function exportMapImage(map: MapLibreMap): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const snapshot = await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      map.off("render", capture);
      reject(new Error("Map tiles are still loading. Wait for the map to finish loading and try again."));
    }, 15000);
    function capture() {
      if (!map.loaded() || !map.areTilesLoaded() || map.isMoving()) return;
      map.off("render", capture);
      window.clearTimeout(timer);
      try {
        const source = map.getCanvas();
        const copy = document.createElement("canvas");
        copy.width = source.width;
        copy.height = source.height;
        const context = copy.getContext("2d");
        if (!context || !copy.width || !copy.height) throw new Error("Map canvas unavailable");
        context.drawImage(source, 0, 0);
        // Do not offer an empty image if a device fails to retain the WebGL pixels.
        const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
        let hasPixels = false;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] !== 0) { hasPixels = true; break; }
        }
        if (!hasPixels) throw new Error("Map canvas is empty");
        resolve(copy);
      } catch { reject(new Error("The map image could not be captured. Let the map finish drawing and try again.")); }
    }
    map.on("render", capture);
    map.triggerRepaint();
  });
  const container = map.getContainer();
  const overlay = await html2canvas(container, {
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    backgroundColor: null,
    logging: false,
    ignoreElements: (element) => element.classList.contains("maplibregl-canvas") || element.classList.contains("maplibregl-popup") ||
      (element.classList.contains("maplibregl-ctrl") && !element.classList.contains("maplibregl-ctrl-attrib")),
    onclone: (_document, clonedContainer) => {
      // html2canvas only renders the transparent DOM overlay. It must never
      // clone the WebGL canvas or asynchronously decode its snapshot as an image.
      clonedContainer.style.background = "transparent";
      clonedContainer.style.border = "none";
      clonedContainer.style.borderRadius = "0";
      clonedContainer.style.boxShadow = "none";
      clonedContainer.querySelectorAll<HTMLElement>(".maplibregl-ctrl-attrib").forEach((attribution) => {
        attribution.classList.remove("maplibregl-compact");
        attribution.style.display = "block";
        attribution.style.background = "white";
        attribution.style.color = "black";
      });
      clonedContainer.querySelectorAll<HTMLElement>(".maplibregl-ctrl-attrib-inner").forEach((inner) => { inner.style.display = "block"; });
      clonedContainer.querySelectorAll(".maplibregl-ctrl-attrib-button").forEach((button) => button.remove());
    },
  });
  const canvas = document.createElement("canvas");
  canvas.width = overlay.width;
  canvas.height = overlay.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the map image. Please try again.");
  context.drawImage(snapshot, 0, 0, canvas.width, canvas.height);
  context.drawImage(overlay, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not create the map image. Please try again.")),
    "image/png",
  ));
}
