import {
  MACROSTRAT_ATTRIBUTION,
  MACROSTRAT_DEFAULT_OPACITY,
  MACROSTRAT_LAYER_ID,
  MACROSTRAT_VECTOR_TILES,
  MACROSTRAT_SOURCE_ID,
} from "./macrostrat-config.ts";

export function ensureMacrostratLayer(map: any, opacity = MACROSTRAT_DEFAULT_OPACITY) {
  if (!map.getSource(MACROSTRAT_SOURCE_ID)) {
    map.addSource(MACROSTRAT_SOURCE_ID, {
      type: "vector",
      tiles: [MACROSTRAT_VECTOR_TILES],
      attribution: MACROSTRAT_ATTRIBUTION,
    });
  }
  if (!map.getLayer(MACROSTRAT_LAYER_ID)) {
    map.addLayer({
      id: MACROSTRAT_LAYER_ID,
      type: "fill",
      source: MACROSTRAT_SOURCE_ID,
      "source-layer": "units",
      paint: {
        "fill-color": ["to-color", ["case", ["==", ["slice", ["to-string", ["get", "color"]], 0, 1], "#"], ["get", "color"], ["concat", "#", ["to-string", ["get", "color"]]]], "#b8b8b8"],
        "fill-opacity": opacity,
        "fill-outline-color": "#555555",
      },
      layout: { visibility: "visible" },
    });
  }
  if (!map.getLayer("geology-lines")) {
    map.addLayer({ id: "geology-lines", type: "line", source: MACROSTRAT_SOURCE_ID, "source-layer": "lines", layout: { visibility: "visible" }, paint: { "line-color": "#444444", "line-width": 1, "line-opacity": opacity } });
  }
  setMacrostratOpacity(map, opacity);
  setMacrostratVisibility(map, true);
}

export function setMacrostratVisibility(map: any, visible: boolean) {
  if (map.getLayer("geology-lines")) map.setLayoutProperty("geology-lines", "visibility", visible ? "visible" : "none");
  if (map.getLayer(MACROSTRAT_LAYER_ID)) {
    map.setLayoutProperty(MACROSTRAT_LAYER_ID, "visibility", visible ? "visible" : "none");
  }
}

export function setMacrostratOpacity(map: any, opacity: number) {
  if (map.getLayer("geology-lines")) map.setPaintProperty("geology-lines", "line-opacity", Math.max(0, Math.min(1, opacity)));
  if (map.getLayer(MACROSTRAT_LAYER_ID)) {
    map.setPaintProperty(MACROSTRAT_LAYER_ID, "fill-opacity", Math.max(0, Math.min(1, opacity)));
  }
}

/** Query the exact screen point, never a nearby area or a separate map compilation. */
export function renderedMacrostratUnit(map: any, point: { x: number; y: number }) {
  if (!map.getLayer(MACROSTRAT_LAYER_ID)) return null;
  const feature = map.queryRenderedFeatures([point.x, point.y], { layers: [MACROSTRAT_LAYER_ID] })[0];
  return feature?.properties ?? null;
}
