/* ── Custom map layer types + localStorage helpers ───────────────────── */

import * as Papa from "papaparse";

export interface CustomMapLayer {
  id: string;
  name: string;
  color: string;
  geojson: string;   // stringified GeoJSON FeatureCollection
  createdAt: string;
}

const KEY = "geofield_custom_layers";
export const SUPPORTED_LAYER_ACCEPT =
  ".geojson,.json,.kml,.gpx,.csv,.tsv,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/gpx+xml,text/csv,text/tab-separated-values";

type LayerFeature = {
  type: "Feature";
  geometry: any;
  properties: Record<string, any>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: LayerFeature[];
};

export interface ParsedCustomLayerFile {
  geojson: string;
  kind: "GeoJSON" | "KML" | "GPX" | "CSV";
  featureCount: number;
}

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

function featureCollection(features: LayerFeature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

function normalizeGeoJson(raw: any): FeatureCollection {
  if (!raw || typeof raw !== "object") throw new Error("Invalid GeoJSON file.");
  if (raw.type === "FeatureCollection" && Array.isArray(raw.features)) {
    return featureCollection(raw.features.filter((feature: any) => feature?.type === "Feature"));
  }
  if (raw.type === "Feature") {
    return featureCollection([{
      type: "Feature",
      geometry: raw.geometry,
      properties: raw.properties || {},
    }]);
  }
  if (typeof raw.type === "string" && raw.coordinates) {
    return featureCollection([{ type: "Feature", geometry: raw, properties: {} }]);
  }
  throw new Error("Invalid GeoJSON file.");
}

function parseXml(text: string, label: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error(`Invalid ${label} file.`);
  }
  return doc;
}

function textOf(parent: Element, tagName: string): string {
  return parent.getElementsByTagName(tagName)[0]?.textContent?.trim() || "";
}

function coordinateTuples(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").map((part) => Number(part.trim())))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
    .map(([lng, lat]) => [lng, lat]);
}

function parseKml(text: string): FeatureCollection {
  const doc = parseXml(text, "KML");
  const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
  const features: LayerFeature[] = [];

  placemarks.forEach((placemark, index) => {
    const name = textOf(placemark, "name") || `Placemark ${index + 1}`;
    const properties = { name };

    Array.from(placemark.getElementsByTagName("Point")).forEach((point) => {
      const coords = coordinateTuples(textOf(point, "coordinates"));
      if (coords[0]) features.push({ type: "Feature", geometry: { type: "Point", coordinates: coords[0] }, properties });
    });

    Array.from(placemark.getElementsByTagName("LineString")).forEach((line) => {
      const coords = coordinateTuples(textOf(line, "coordinates"));
      if (coords.length >= 2) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties });
    });

    Array.from(placemark.getElementsByTagName("Polygon")).forEach((polygon) => {
      const rings = Array.from(polygon.getElementsByTagName("LinearRing"))
        .map((ring) => coordinateTuples(textOf(ring, "coordinates")))
        .filter((coords) => coords.length >= 4);
      if (rings.length) features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: rings }, properties });
    });
  });

  return featureCollection(features);
}

function gpxPoint(point: Element): number[] | null {
  const lat = Number(point.getAttribute("lat"));
  const lng = Number(point.getAttribute("lon"));
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
}

function parseGpx(text: string): FeatureCollection {
  const doc = parseXml(text, "GPX");
  const features: LayerFeature[] = [];

  Array.from(doc.getElementsByTagName("wpt")).forEach((point, index) => {
    const coords = gpxPoint(point);
    if (!coords) return;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: { name: textOf(point, "name") || `Waypoint ${index + 1}` },
    });
  });

  Array.from(doc.getElementsByTagName("trkseg")).forEach((segment, index) => {
    const coords = Array.from(segment.getElementsByTagName("trkpt")).map(gpxPoint).filter(Boolean) as number[][];
    if (coords.length >= 2) {
      features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { name: `Track ${index + 1}` } });
    }
  });

  Array.from(doc.getElementsByTagName("rte")).forEach((route, index) => {
    const coords = Array.from(route.getElementsByTagName("rtept")).map(gpxPoint).filter(Boolean) as number[][];
    if (coords.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { name: textOf(route, "name") || `Route ${index + 1}` },
      });
    }
  });

  return featureCollection(features);
}

function findHeader(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()));
}

function parseCsv(text: string, fileName: string): FeatureCollection {
  const delimiter = fileName.toLowerCase().endsWith(".tsv") || text.split("\t").length > text.split(",").length ? "\t" : ",";
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) throw new Error("Invalid CSV file.");

  const headers = parsed.meta.fields || [];
  if (!headers.length || !parsed.data.length) throw new Error("CSV files need a header row and at least one data row.");
  const latIndex = findHeader(headers, ["lat", "latitude", "y"]);
  const lngIndex = findHeader(headers, ["lon", "lng", "long", "longitude", "x"]);
  if (latIndex === -1 || lngIndex === -1) {
    throw new Error("CSV files need latitude and longitude columns.");
  }

  const latHeader = headers[latIndex];
  const lngHeader = headers[lngIndex];
  const features = parsed.data.flatMap((row) => {
    const lat = Number(row[latHeader]);
    const lng = Number(row[lngHeader]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];
    const properties = headers.reduce<Record<string, string>>((acc, header) => {
      acc[header] = row[header] || "";
      return acc;
    }, {});
    return [{ type: "Feature" as const, geometry: { type: "Point", coordinates: [lng, lat] }, properties }];
  });

  return featureCollection(features);
}

export async function parseCustomLayerFile(file: File): Promise<ParsedCustomLayerFile> {
  const text = await file.text();
  const fileName = file.name.toLowerCase();
  let kind: ParsedCustomLayerFile["kind"];
  let collection: FeatureCollection;

  if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
    kind = "GeoJSON";
    try {
      collection = normalizeGeoJson(JSON.parse(text));
    } catch {
      throw new Error("Invalid GeoJSON file.");
    }
  } else if (fileName.endsWith(".kml")) {
    kind = "KML";
    collection = parseKml(text);
  } else if (fileName.endsWith(".gpx")) {
    kind = "GPX";
    collection = parseGpx(text);
  } else if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
    kind = "CSV";
    collection = parseCsv(text, file.name);
  } else {
    throw new Error("Unsupported layer file. Use GeoJSON, KML, GPX, CSV, or TSV.");
  }

  if (!collection.features.length) throw new Error(`${kind} file did not contain any usable map features.`);
  return {
    geojson: JSON.stringify(collection),
    kind,
    featureCount: collection.features.length,
  };
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
