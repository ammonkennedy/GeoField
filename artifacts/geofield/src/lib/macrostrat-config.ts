export const MACROSTRAT_RASTER_TILES = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
export const MACROSTRAT_VECTOR_TILES = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.mvt";
export const MACROSTRAT_UNITS_URL = "https://macrostrat.org/api/v2/geologic_units/map";
export const MACROSTRAT_SOURCES_URL = "https://macrostrat.org/api/v2/defs/sources";
export const MACROSTRAT_ATTRIBUTION = "Geologic map data © Macrostrat and original map providers, CC BY 4.0";
export const MACROSTRAT_SOURCE_ID = "geology";
export const MACROSTRAT_LAYER_ID = "geology-overlay";
export const MACROSTRAT_DEFAULT_OPACITY = 0.65;

export function macrostratUnitQueryUrl(latitude: number, longitude: number) {
  const url = new URL(MACROSTRAT_UNITS_URL);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lng", String(longitude));
  url.searchParams.set("response", "long");
  return url.toString();
}

export function macrostratSourceQueryUrl(sourceId: string | number) {
  const url = new URL(MACROSTRAT_SOURCES_URL);
  url.searchParams.set("source_id", String(sourceId));
  return url.toString();
}
