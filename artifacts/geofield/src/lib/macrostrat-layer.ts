import {
  MACROSTRAT_ATTRIBUTION,
  MACROSTRAT_DEFAULT_OPACITY,
  MACROSTRAT_LAYER_ID,
  MACROSTRAT_RASTER_TILES,
  MACROSTRAT_SOURCE_ID,
} from "./macrostrat-config.ts";

export function ensureMacrostratLayer(map: any, opacity = MACROSTRAT_DEFAULT_OPACITY) {
  if (!map.getSource(MACROSTRAT_SOURCE_ID)) {
    map.addSource(MACROSTRAT_SOURCE_ID, {
      type: "raster",
      tiles: [MACROSTRAT_RASTER_TILES],
      tileSize: 256,
      attribution: MACROSTRAT_ATTRIBUTION,
    });
  }
  if (!map.getLayer(MACROSTRAT_LAYER_ID)) {
    map.addLayer({
      id: MACROSTRAT_LAYER_ID,
      type: "raster",
      source: MACROSTRAT_SOURCE_ID,
      paint: { "raster-opacity": opacity },
      layout: { visibility: "visible" },
    });
  }
  setMacrostratOpacity(map, opacity);
  setMacrostratVisibility(map, true);
}

export function setMacrostratVisibility(map: any, visible: boolean) {
  if (map.getLayer(MACROSTRAT_LAYER_ID)) {
    map.setLayoutProperty(MACROSTRAT_LAYER_ID, "visibility", visible ? "visible" : "none");
  }
}

export function setMacrostratOpacity(map: any, opacity: number) {
  if (map.getLayer(MACROSTRAT_LAYER_ID)) {
    map.setPaintProperty(MACROSTRAT_LAYER_ID, "raster-opacity", Math.max(0, Math.min(1, opacity)));
  }
}
