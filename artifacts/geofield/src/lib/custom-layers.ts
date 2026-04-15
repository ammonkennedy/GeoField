/* ── Custom map layer types + localStorage helpers ───────────────────── */

export interface CustomMapLayer {
  id: string;
  name: string;
  color: string;
  geojson: string;   // stringified GeoJSON FeatureCollection / Feature
  createdAt: string;
}

const KEY = "geofield_custom_layers";

export function loadCustomLayers(): CustomMapLayer[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function saveCustomLayers(layers: CustomMapLayer[]) {
  localStorage.setItem(KEY, JSON.stringify(layers));
  window.dispatchEvent(new Event("custom-layers-updated"));
}

export function addCustomLayer(layer: CustomMapLayer) {
  const all = loadCustomLayers();
  all.push(layer);
  saveCustomLayers(all);
}

export function deleteCustomLayer(id: string) {
  const all = loadCustomLayers().filter((l) => l.id !== id);
  saveCustomLayers(all);
}

/* ── MapLibre helpers (call after map.on("load")) ───────────────────── */
export function safeAddCustomLayer(map: any, layer: CustomMapLayer) {
  const srcId  = `clayer_${layer.id}`;
  const fillId = `clayer_fill_${layer.id}`;
  const lineId = `clayer_line_${layer.id}`;
  const dotId  = `clayer_dot_${layer.id}`;
  try {
    if (map.getSource(srcId)) return;
    map.addSource(srcId, { type: "geojson", data: JSON.parse(layer.geojson) });
    map.addLayer({
      id: fillId, type: "fill", source: srcId,
      paint: { "fill-color": layer.color, "fill-opacity": 0.3 },
    });
    map.addLayer({
      id: lineId, type: "line", source: srcId,
      paint: { "line-color": layer.color, "line-width": 2, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: dotId, type: "circle", source: srcId,
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-color": layer.color,
        "circle-radius": 7,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
  } catch {}
}

export function safeRemoveCustomLayer(map: any, layerId: string) {
  for (const id of [
    `clayer_fill_${layerId}`,
    `clayer_line_${layerId}`,
    `clayer_dot_${layerId}`,
  ]) {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
  }
  try {
    if (map.getSource(`clayer_${layerId}`)) map.removeSource(`clayer_${layerId}`);
  } catch {}
}
