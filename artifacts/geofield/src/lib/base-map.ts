import type { Map } from "maplibre-gl";

export type BaseMap = "satellite" | "street" | "topographic";

export function applyBaseMap(map: Map, selected: BaseMap) {
  // These raster sources use 256px tiles; MapLibre camera zoom uses 512px.
  // Avoid enlarging the final topo/street tile until a single flat patch fills
  // the viewport. Restore the existing satellite range when switching back.
  map.setMaxZoom(selected === "topographic" ? 15 : selected === "street" ? 18 : 22);
  for (const layer of ["satellite", "street", "topographic"] as const) {
    if (map.getLayer(`${layer}-layer`)) {
      map.setLayoutProperty(`${layer}-layer`, "visibility", layer === selected ? "visible" : "none");
    }
  }
  if (map.getLayer("labels")) {
    map.setLayoutProperty("labels", "visibility", selected === "satellite" ? "visible" : "none");
  }
}
