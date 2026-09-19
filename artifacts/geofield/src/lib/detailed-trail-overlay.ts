import type { Map, MapGeoJSONFeature, LngLatLike, Popup } from "maplibre-gl";
import { EMPTY_TRAILS, loadDetailedTrails, trailSegmentDetails, type TrailBounds } from "./detailed-trails.ts";

const SOURCE = "local-trails";
const LINE = "local-trails-line";
const CASING = "local-trails-casing";
const controllers = new WeakMap<Map, () => void>();
const popups = new WeakMap<Map, Popup>();

export function removeDetailedTrails(map: Map) {
  controllers.get(map)?.();
  controllers.delete(map);
  popups.get(map)?.remove();
  popups.delete(map);
  for (const id of [LINE, CASING]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
}

export function addDetailedTrails(map: Map, before?: string) {
  removeDetailedTrails(map);
  map.addSource(SOURCE, { type: "geojson", data: EMPTY_TRAILS, attribution: "USGS The National Map · State and local trail contributors" });
  map.addLayer({ id: CASING, type: "line", source: SOURCE, minzoom: 12, paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.85 } }, before);
  map.addLayer({ id: LINE, type: "line", source: SOURCE, minzoom: 12, paint: { "line-color": "#0284c7", "line-width": 3 } }, before);
  const notice = document.createElement("div");
  notice.className = "maplibregl-ctrl";
  notice.style.cssText = "background:white;color:#0f172a;padding:8px;border-radius:6px;max-width:220px;font:12px system-ui;box-shadow:0 1px 4px #0003;";
  notice.setAttribute("aria-live", "polite");
  const text = document.createElement("span");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry";
  retry.style.cssText = "display:none;margin-left:8px;text-decoration:underline;min-height:32px;";
  notice.append(text, retry);
  const control = { onAdd: () => notice, onRemove: () => notice.remove() };
  map.addControl(control, "bottom-left");
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loaded: TrailBounds | undefined;
  let disposed = false;
  let revision = 0;
  const refresh = async () => {
    const generation = ++revision;
    request?.abort();
    retry.style.display = "none";
    const box = map.getBounds();
    const bounds: TrailBounds = [box.getWest(), box.getSouth(), box.getEast(), box.getNorth()];
    if (map.getZoom() < 12 || bounds[2] - bounds[0] > 0.3 || bounds[3] - bounds[1] > 0.3 || bounds[0] >= bounds[2]) {
      text.textContent = "Zoom in for smaller U.S. trails. Marked routes remain visible.";
      return;
    }
    if (loaded && bounds[0] >= loaded[0] && bounds[1] >= loaded[1] && bounds[2] <= loaded[2] && bounds[3] <= loaded[3]) {
      text.textContent = "Tap blue trails for details · USGS (U.S. coverage)";
      return;
    }
    // Buffer the viewport to reduce repeat requests while panning slightly.
    const dx = (bounds[2] - bounds[0]) * 0.15, dy = (bounds[3] - bounds[1]) * 0.15;
    const area: TrailBounds = [Math.max(-180, bounds[0] - dx), Math.max(-85, bounds[1] - dy), Math.min(180, bounds[2] + dx), Math.min(85, bounds[3] + dy)];
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    text.textContent = "Loading smaller trails…";
    try {
      const result = await loadDetailedTrails(area, controller.signal);
      if (disposed || generation !== revision) return;
      const source = map.getSource(SOURCE) as import("maplibre-gl").GeoJSONSource | undefined;
      source?.setData(result.data);
      loaded = result.limited ? undefined : area;
      text.textContent = result.limited ? "Some trails shown. Zoom in to load more." : result.data.features.length ? "Tap blue trails for details · USGS (U.S. coverage)" : "No detailed USGS trails here. Marked routes may still be available.";
    } catch {
      if (disposed || generation !== revision) return;
      text.textContent = "Smaller trails unavailable. Check your connection.";
      retry.style.display = "inline-block";
    } finally { clearTimeout(timeout); }
  };
  const schedule = () => {
    revision++;
    request?.abort();
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 500);
  };
  retry.onclick = () => { loaded = undefined; void refresh(); };
  const dispose = () => {
    disposed = true;
    revision++;
    request?.abort();
    clearTimeout(timer);
    map.off("moveend", schedule);
    map.off("remove", dispose);
    map.removeControl(control);
  };
  controllers.set(map, dispose);
  map.on("moveend", schedule);
  map.on("remove", dispose);
  void refresh();
}

/** Select the closest visible line within an 18px finger-friendly tolerance. */
export function showDetailedTrailPopup(map: Map, point: { x: number; y: number }, lngLat: LngLatLike, PopupClass: typeof Popup): boolean {
  if (!map.getLayer(LINE)) return false;
  const features = map.queryRenderedFeatures([[point.x - 18, point.y - 18], [point.x + 18, point.y + 18]], { layers: [LINE] });
  const distance = (feature: MapGeoJSONFeature) => {
    const geometry = feature.geometry;
    const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
    let closest = Infinity;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = map.project(line[i - 1] as [number, number]), b = map.project(line[i] as [number, number]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      closest = Math.min(closest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
    }
    return closest;
  };
  features.sort((a, b) => distance(a) - distance(b));
  const feature = features[0];
  if (!feature || distance(feature) > 18) return false;
  const properties = feature.properties ?? {};
  const detail = trailSegmentDetails(properties);
  const content = document.createElement("div");
  content.style.cssText = "color:#0f172a;max-height:300px;overflow-y:auto;";
  const title = document.createElement("strong");
  title.textContent = detail.name;
  content.append(title);
  for (const value of [`Mapped segment: ${detail.distance}`, properties.trailsurface && `Surface: ${properties.trailsurface}`, properties.seasonopen && `Season: ${properties.seasonopen}`, properties.hikerpedestrian && `Hiking access: ${properties.hikerpedestrian}`, `Source: ${detail.source} / USGS`, "Segment distance is not the full hike or a round trip."]) {
    if (!value) continue;
    const row = document.createElement("p"); row.textContent = value; content.append(row);
  }
  popups.get(map)?.remove();
  popups.set(map, new PopupClass({ maxWidth: "300px" }).setLngLat(lngLat).setDOMContent(content).addTo(map));
  return true;
}
