import type { Map as MapLibreMap } from "maplibre-gl";

/** Capture WebGL during rendering, then include DOM markers and attribution. */
export async function exportMapImage(map: MapLibreMap): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const snapshot = await new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      map.off("render", capture);
      reject(new Error("Map tiles are still loading. Wait for the map to finish loading and try again."));
    }, 15000);
    function capture() {
      if (!map.loaded() || !map.areTilesLoaded() || map.isMoving()) return;
      map.off("render", capture);
      window.clearTimeout(timer);
      try { resolve(map.getCanvas().toDataURL("image/png")); }
      catch { reject(new Error("This map could not be captured. Try another map layer.")); }
    }
    map.on("render", capture);
    map.triggerRepaint();
  });
  const container = map.getContainer();
  const canvas = await html2canvas(container, {
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    ignoreElements: (element) => element.classList.contains("maplibregl-popup") ||
      (element.classList.contains("maplibregl-ctrl") && !element.classList.contains("maplibregl-ctrl-attrib")),
    onclone: (_document, clonedContainer) => {
      // A WebGL buffer may be cleared between frames. Use the synchronous snapshot
      // instead of enabling preserveDrawingBuffer on every interactive map frame.
      const mapCanvas = clonedContainer.querySelector("canvas.maplibregl-canvas");
      const image = _document.createElement("img");
      image.src = snapshot;
      image.style.cssText = map.getCanvas().style.cssText;
      image.style.position = "absolute";
      mapCanvas?.replaceWith(image);
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
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not create the map image. Please try again.")),
    "image/png",
  ));
}
