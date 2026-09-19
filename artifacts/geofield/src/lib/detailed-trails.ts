
export const TRAIL_SERVICE = "https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/37";
export interface TrailData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: number | string;
    properties: Record<string, any>;
    geometry: { type: "LineString"; coordinates: number[][] } | { type: "MultiLineString"; coordinates: number[][][] };
  }>;
}
export type TrailBounds = [number, number, number, number];
export const EMPTY_TRAILS: TrailData = { type: "FeatureCollection", features: [] };

export function trailSegmentDetails(properties: Record<string, any>) {
  const miles = properties.lengthmiles;
  return {
    name: properties.name || properties.maplabel || properties.trailnumber || "Unnamed trail",
    distance: typeof miles === "number" && Number.isFinite(miles) && miles > 0
      ? `${(miles * 1.609344).toFixed(2)} km (${miles.toFixed(2)} mi)` : "Distance unavailable",
    source: properties.sourceoriginator || "USGS The National Map",
  };
}

export async function loadDetailedTrails(bounds: TrailBounds, signal: AbortSignal): Promise<{ data: TrailData; limited: boolean }> {
  if (bounds.some((n) => !Number.isFinite(n)) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) throw new Error("Invalid trail map bounds");
  const features: TrailData["features"] = [];
  const ids = new Set<number | string>();
  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams({
      f: "geojson", where: "1=1", geometry: bounds.join(","), geometryType: "esriGeometryEnvelope",
      inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", returnGeometry: "true",
      outFields: "objectid,name,maplabel,trailnumber,lengthmiles,sourceoriginator,trailsurface,seasonopen,hikerpedestrian,trailtype",
      orderByFields: "objectid", resultOffset: String(page * 1000), resultRecordCount: "1000",
    });
    const response = await fetch(`${TRAIL_SERVICE}/query?${params}`, { signal });
    if (!response.ok) throw new Error(`Trail service returned ${response.status}`);
    const result = await response.json();
    if (result.error || !Array.isArray(result.features)) throw new Error("Trail information is temporarily unavailable");
    for (const feature of result.features) {
      if (!["LineString", "MultiLineString"].includes(feature.geometry?.type)) continue;
      // The service also contains water trails and trails explicitly closed to hikers.
      const properties = feature.properties ?? {};
      if (/water/i.test(properties.trailtype ?? "") || /^(no|n)$/i.test(properties.hikerpedestrian ?? "")) continue;
      const id = feature.id ?? properties.objectid;
      if (id == null || ids.has(id)) continue;
      ids.add(id);
      features.push({ ...feature, id });
    }
    if (!result.exceededTransferLimit && !result.properties?.exceededTransferLimit && result.features.length < 1000) {
      return { data: { type: "FeatureCollection", features }, limited: false };
    }
  }
  return { data: { type: "FeatureCollection", features }, limited: true };
}
