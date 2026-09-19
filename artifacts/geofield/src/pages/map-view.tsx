import { addDetailedTrails, removeDetailedTrails, showDetailedTrailPopup } from "@/lib/detailed-trail-overlay";
import { applyBaseMap } from "@/lib/base-map";
import { exportMapImage } from "@/lib/export-map";
import { saveFile } from "@/lib/save-file";
import { lookupHikingTrails } from "@/lib/hiking-trails";
import { useState, useEffect, useMemo, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useGetCurrentAuthUser, useGetSamples, useGetFolders } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MapPin, FolderOpen, Layers, Satellite, Map as MapIcon, Mountain, Plus, Upload, X as XIcon, Search, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadCustomLayers,
  addCustomLayer,
  deleteCustomLayer,
  safeAddCustomLayer,
  safeRemoveCustomLayer,
  parseCustomLayerFile,
  SUPPORTED_LAYER_ACCEPT,
  type CustomMapLayer,
} from "@/lib/custom-layers";
import { getQueue, QUEUE_UPDATED_EVENT } from "@/lib/offline-queue";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import { geocodeAddress, geocodeAddressSuggestions, type GeocodeResult } from "@/lib/geocoding";
import { lookupSoil } from "@/lib/soil-data";
import { MacrostratGeologyInfo } from "@/components/MacrostratGeologyInfo";
import { ensureMacrostratLayer, setMacrostratOpacity, setMacrostratVisibility } from "@/lib/macrostrat-layer";
import { MACROSTRAT_DEFAULT_OPACITY } from "@/lib/macrostrat-config";
import { queryMacrostratGeology } from "@/lib/macrostrat-service";
import type { MacrostratSelection } from "@/lib/macrostrat-types";
import { CLOUD_SAMPLES_UPDATED_EVENT, getCachedCloudSamples, mergeCloudAndLocal } from "@/lib/cloud-samples";
import "maplibre-gl/dist/maplibre-gl.css";
import { requireAccountForSave } from "@/lib/guest-access";
import { loadMeasurements, STRIKE_DIP_UPDATED_EVENT, type StrikeDipMeasurement } from "@/lib/strike-dip-measurements";

const TYPE_COLORS: Record<string, string> = {
  water: "#2d7dd2",
  rock: "#8b5e3c",
  soil_sand: "#c49a3c",
  air: "#64748b",
  other: "#64748b",
};
const TYPE_LABELS: Record<string, string> = {
  water: "Water",
  rock: "Rock",
  soil_sand: "Soil/Sediment",
  air: "Air",
  other: "Other",
};

function formatCoord(value: number) {
  return value.toFixed(7);
}

function measurementCoords(measurement: StrikeDipMeasurement): [number, number] | null {
  if (Number.isFinite(measurement.latitude) && Number.isFinite(measurement.longitude)) {
    return [measurement.latitude!, measurement.longitude!];
  }
  return parseCoords(measurement.location);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function getSampleLabel(sample: any) {
  if (sample.fields?.collectionStatus === "planned") return "Future Sample Site";
  if (sample.sampleType === "other") {
    return sample.fields?.otherSampleTitle || sample.fields?.title || sample.sampleId || "Other";
  }
  return TYPE_LABELS[sample.sampleType] || sample.sampleType || "Sample";
}

type BaseLayer = "street" | "satellite" | "topographic";
type OverlayLayer = "none" | "geology" | "soil" | "trails";

const SATELLITE_IMAGERY_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const USGS_TOPO_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const ESRI_STREET_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const TRAILS_TILES = "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png";
const SOIL_WMS =
  "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=TRUE&LAYERS=mapunitpoly&STYLES=default&WIDTH=256&HEIGHT=256&SRS=EPSG%3A3857&BBOX={bbox-epsg-3857}";

function parseCoords(raw: unknown): [number, number] | null {
  if (!raw && raw !== 0) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const match = str.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return [lat, lng];
  }
  const nums = str.match(/-?\d+\.?\d*/g);
  if (nums && nums.length >= 2) {
    const lat = parseFloat(nums[0]);
    const lng = parseFloat(nums[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return [lat, lng];
  }
  return null;
}

// Build the initial static map style (both raster sources baked in, toggle via visibility)
const INITIAL_STYLE: any = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [SATELLITE_IMAGERY_TILES],
      tileSize: 256,
      attribution: 'Source: <a href="https://goto.arcgisonline.com/maps/World_Imagery" target="_blank" rel="noopener noreferrer">Esri World Imagery</a>, Vantor, Earthstar Geographics, and the GIS User Community',
      // Request detailed imagery instead of enlarging the old level-16 tiles.
      // Ground resolution varies by location; deeper zoom still magnifies pixels.
      maxzoom: 19,
    },
    street: {
      type: "raster",
      tiles: [ESRI_STREET_TILES],
      tileSize: 256,
      attribution: "© Esri",
      maxzoom: 19,
    },
    topographic: {
      type: "raster",
      tiles: [USGS_TOPO_TILES],
      tileSize: 256,
      attribution: "USGS The National Map",
      maxzoom: 16,
    },
    terrain: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 15,
      encoding: "terrarium",
      attribution: "Mapzen terrain tiles on AWS",
    },
  },
  layers: [
    { id: "satellite-layer", type: "raster", source: "satellite", layout: { visibility: "visible" } },
    { id: "street-layer", type: "raster", source: "street", layout: { visibility: "none" } },
    { id: "topographic-layer", type: "raster", source: "topographic", layout: { visibility: "none" } },
  ],
  sky: {
    "sky-color": "#87CEEB",
    "sky-horizon-blend": 0.5,
    "horizon-color": "#f9f5e4",
    "horizon-fog-blend": 0.5,
    "fog-color": "#f9f5e4",
    "fog-ground-blend": 0.5,
  },
};

function safeRemoveOverlays(map: any) {
  removeDetailedTrails(map);
  setMacrostratVisibility(map, false);
  for (const id of ["soil-overlay", "trails-overlay"]) {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
  }
  for (const id of ["soil", "trails-src"]) {
    try { if (map.getSource(id)) map.removeSource(id); } catch {}
  }
}

function safeAddOverlay(map: any, overlay: OverlayLayer, geologyOpacity = MACROSTRAT_DEFAULT_OPACITY) {
  try {
    if (overlay === "geology") {
      ensureMacrostratLayer(map, geologyOpacity);
    } else if (overlay === "soil") {
      map.addSource("soil", { type: "raster", tiles: [SOIL_WMS], tileSize: 256, minzoom: 4, maxzoom: 18, attribution: "USDA NRCS SSURGO via Soil Data Access" });
      map.addLayer({ id: "soil-overlay", type: "raster", source: "soil", paint: { "raster-opacity": 0.65 } });
    } else if (overlay === "trails") {
      map.addSource("trails-src", {
        type: "raster",
        tiles: [TRAILS_TILES],
        tileSize: 256,
        attribution: "© <a href='https://www.waymarkedtrails.org'>Waymarked Trails</a>, © OpenStreetMap contributors",
        minzoom: 5,
      });
      map.addLayer({ id: "trails-overlay", type: "raster", source: "trails-src", paint: { "raster-opacity": 0.9 } });
      addDetailedTrails(map);
    }
  } catch {}
}

interface GeoInfo {
  loading: boolean;
  data?: Record<string, string> | null;
  error?: string;
  lngLat?: [number, number];
  macrostrat?: MacrostratSelection | null;
}

export default function MapViewPage() {
  const [, setLocation] = useLocation();
  const { data: authData } = useGetCurrentAuthUser();
  const [selectedFolderId, setSelectedFolderId] = useState<number | string | "all">("all");
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const baseLayerRef = useRef<BaseLayer>("satellite");
  const [overlayLayer, setOverlayLayer] = useState<OverlayLayer>("none");
  const [geologyOpacity, setGeologyOpacity] = useState(MACROSTRAT_DEFAULT_OPACITY);
  const [terrain, setTerrain] = useState(false);
  const trailRequestRef = useRef<AbortController | null>(null);
  const trailPopupRef = useRef<any>(null);
  const [geoInfo, setGeoInfo] = useState<GeoInfo | null>(null);
  const [customLayers, setCustomLayers] = useState<CustomMapLayer[]>(loadCustomLayers);
  const [queuedSamples, setQueuedSamples] = useState(getQueue);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const [sampleSearch, setSampleSearch] = useState("");
  const [addressLookupLoading, setAddressLookupLoading] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodeResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportImage, setExportImage] = useState<{ blob: Blob; url: string } | null>(null);
  const exportModeRef = useRef(false);
  useEffect(() => { exportModeRef.current = exportMode; }, [exportMode]);
  useEffect(() => () => { if (exportImage) URL.revokeObjectURL(exportImage.url); }, [exportImage]);
  const [mapFullScreen, setMapFullScreen] = useState(false);
  const [layerModalOpen, setLayerModalOpen] = useState(false);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerColor, setNewLayerColor] = useState("#e63946");
  const [newLayerGeoJson, setNewLayerGeoJson] = useState<string | null>(null);
  const [newLayerError, setNewLayerError] = useState("");
  const [newLayerFileName, setNewLayerFileName] = useState("");
  const [newLayerFileSummary, setNewLayerFileSummary] = useState("");
  const [cachedCloudSamples, setCachedCloudSamples] = useState(getCachedCloudSamples);
  const [measurements, setMeasurements] = useState<StrikeDipMeasurement[]>(loadMeasurements);

  const { data: folders } = useGetFolders();
  const { data: serverSamples } = useGetSamples();
  const offlineSamples = useMemo(() => queuedSamples.map((item: any, index: number) => ({
    id: item.queuedId || `offline-${index}`,
    ...item.payload,
    offline: true,
    queuedAt: item.queuedAt,
  })), [queuedSamples]);
  const allSamples = useMemo(() => mergeCloudAndLocal((serverSamples ?? cachedCloudSamples) as any[], offlineSamples as any[]), [serverSamples, cachedCloudSamples, offlineSamples]);
  const hasLegacyAirSamples = allSamples.some((sample: any) => sample.sampleType === "air");
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const popupRef = useRef<any>(null);
  const layerFileInputRef = useRef<HTMLInputElement>(null);
  const customLayersRef = useRef<CustomMapLayer[]>(loadCustomLayers());
  // Use refs for values accessed inside async / event-handler closures to avoid stale captures
  const overlayLayerRef = useRef<OverlayLayer>("none");
  const terrainRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const geologyOpacityRef = useRef(MACROSTRAT_DEFAULT_OPACITY);
  const geologyRequestRef = useRef<AbortController | null>(null);
  const geologyRequestIdRef = useRef(0);

  function startMapExport() {
    setGeoInfo(null);
    geologyRequestRef.current?.abort();
    trailRequestRef.current?.abort();
    trailPopupRef.current?.remove();
    popupRef.current?.remove();
    setExportError("");
    setExportImage(null);
    setMapFullScreen(false);
    setExportMode(true);
  }

  async function prepareMapExport() {
    if (!mapRef.current || exportBusy) return;
    setExportBusy(true);
    setExportError("");
    try {
      const blob = await exportMapImage(mapRef.current);
      setExportImage({ blob, url: URL.createObjectURL(blob) });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export this map. Please try again.");
    } finally { setExportBusy(false); }
  }

  async function saveMapExport() {
    if (!exportImage || exportBusy) return;
    setExportBusy(true);
    setExportError("");
    try {
      await saveFile(exportImage.blob, `GeoField-map-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
      setExportImage(null);
      setExportMode(false);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setExportError("Could not save the image. Please try again.");
      }
    } finally { setExportBusy(false); }
  }

  const filteredSamples = (allSamples || []).filter((s) =>
    selectedFolderId === "all" ? true : String(s.folderId ?? "") === String(selectedFolderId)
  );
  const samplesWithCoords = filteredSamples.filter((s) => parseCoords((s.fields as any)?.location));
  const filteredMeasurements = measurements.filter((measurement) =>
    selectedFolderId === "all" ? true : String(measurement.datasetId ?? "") === String(selectedFolderId)
  );
  const measurementsWithCoords = filteredMeasurements.filter(measurementCoords);
  const searchableSamples = (allSamples || [])
    .map((sample) => ({ sample, coords: parseCoords((sample.fields as any)?.location) }))
    .filter((entry) => entry.coords);
  const searchMatches = sampleSearch.trim()
    ? searchableSamples
        .filter(({ sample }) => {
          const query = sampleSearch.trim().toLowerCase();
          return String(sample.sampleId || "").toLowerCase().includes(query) ||
            getSampleLabel(sample).toLowerCase().includes(query);
        })
        .slice(0, 8)
    : [];

  useEffect(() => {
    const query = sampleSearch.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        setAddressSuggestions(await geocodeAddressSuggestions(query, 6, controller.signal));
      } catch (error: any) {
        if (error?.name !== "AbortError") setAddressSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [sampleSearch]);

  useEffect(() => {
    mapRef.current?.resize?.();
    const timer = window.setTimeout(() => mapRef.current?.resize?.(), 100);
    return () => window.clearTimeout(timer);
  }, [mapFullScreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapFullScreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep overlayLayerRef in sync with state
  useEffect(() => {
    overlayLayerRef.current = overlayLayer;
    trailRequestRef.current?.abort();
    trailPopupRef.current?.remove();
    trailPopupRef.current = null;
    if (overlayLayer !== "geology") {
      geologyRequestRef.current?.abort();
      geologyRequestRef.current = null;
    }
  }, [overlayLayer]);

  useEffect(() => {
    geologyOpacityRef.current = geologyOpacity;
    if (mapRef.current && mapLoadedRef.current) setMacrostratOpacity(mapRef.current, geologyOpacity);
  }, [geologyOpacity]);

  useEffect(() => {
    terrainRef.current = terrain;
  }, [terrain]);

  useEffect(() => {
    const refreshQueue = () => setQueuedSamples(getQueue());
    window.addEventListener(QUEUE_UPDATED_EVENT, refreshQueue);
    window.addEventListener("storage", refreshQueue);
    return () => {
      window.removeEventListener(QUEUE_UPDATED_EVENT, refreshQueue);
      window.removeEventListener("storage", refreshQueue);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setCachedCloudSamples(getCachedCloudSamples());
    window.addEventListener(CLOUD_SAMPLES_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CLOUD_SAMPLES_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshDatasets = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
    window.addEventListener("storage", refreshDatasets);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
      window.removeEventListener("storage", refreshDatasets);
    };
  }, []);

  useEffect(() => {
    const refreshMeasurements = () => setMeasurements(loadMeasurements());
    window.addEventListener(STRIKE_DIP_UPDATED_EVENT, refreshMeasurements);
    window.addEventListener("storage", refreshMeasurements);
    return () => {
      window.removeEventListener(STRIKE_DIP_UPDATED_EVENT, refreshMeasurements);
      window.removeEventListener("storage", refreshMeasurements);
    };
  }, []);

  // Sync customLayers from localStorage changes (e.g. after delete)
  useEffect(() => {
    const handler = () => setCustomLayers(loadCustomLayers());
    window.addEventListener("custom-layers-updated", handler);
    return () => window.removeEventListener("custom-layers-updated", handler);
  }, []);

  // Keep customLayersRef in sync + update map when list changes
  useEffect(() => {
    customLayersRef.current = customLayers;
    if (!mapRef.current || !mapLoadedRef.current) return;
    const map = mapRef.current;
    const existingIds = new Set<string>(
      (map.getStyle()?.layers ?? [])
        .filter((l: any) => l.id.startsWith("clayer_fill_"))
        .map((l: any) => (l.id as string).replace("clayer_fill_", ""))
    );
    const newIds = new Set<string>(customLayers.map((l) => l.id));
    existingIds.forEach((id) => { if (!newIds.has(id)) safeRemoveCustomLayer(map, id); });
    customLayers.forEach((layer) => { if (!existingIds.has(layer.id)) safeAddCustomLayer(map, layer); });
  }, [customLayers]);

  // ── INITIALIZE MAP ONCE ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    import("maplibre-gl").then((L) => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = new L.Map({
        container: mapContainerRef.current!,
        // iOS may discard WebGL pixels after presenting a frame. Retain them
        // so export can copy the actual map, not an empty graphics buffer.
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style: INITIAL_STYLE,
        center: [-98.35, 39.5],
        zoom: 4,
        pitch: 0,
        maxPitch: 85,
        dragRotate: true,
        pitchWithRotate: true,
        touchPitch: true,
        attributionControl: {},
      });
      mapRef.current = map;

      map.addControl(new L.NavigationControl({ visualizePitch: true }), "top-right");
      const geolocateControl = new L.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: true,
      });
      map.addControl(geolocateControl, "top-right");
      map.addControl({
        onAdd(controlMap: any) {
          const container = document.createElement("div");
          container.className = "maplibregl-ctrl maplibregl-ctrl-group";

          const makeTiltButton = (direction: "up" | "down") => {
            const button = document.createElement("button");
            button.type = "button";
            const towardHorizon = direction === "up";
            button.title = towardHorizon ? "Tilt view toward the horizon" : "Tilt view toward the ground";
            button.setAttribute("aria-label", button.title);
            button.innerHTML = `<span aria-hidden="true" style="display:block;font-size:20px;line-height:20px;font-weight:700;transform:${towardHorizon ? "translateY(2px)" : "translateY(-2px)"}">${towardHorizon ? "⌃" : "⌄"}</span>`;
            button.addEventListener("click", () => {
              if (towardHorizon && !terrainRef.current) {
                setTerrain(true);
                return;
              }
              if (!terrainRef.current) return;
              const nextPitch = Math.max(0, Math.min(80, controlMap.getPitch() + (towardHorizon ? 10 : -10)));
              controlMap.easeTo({ pitch: nextPitch, duration: 250, essential: true });
            });
            return button;
          };

          container.append(makeTiltButton("up"), makeTiltButton("down"));
          return container;
        },
        onRemove() {},
      }, "top-right");
      map.addControl(new L.ScaleControl(), "bottom-left");

      map.on("load", () => {
        mapLoadedRef.current = true;
        applyBaseMap(map, baseLayerRef.current);
        if (terrainRef.current) map.setTerrain({ source: "terrain", exaggeration: 1.5 });
        if (overlayLayerRef.current !== "none") {
          safeAddOverlay(map, overlayLayerRef.current, geologyOpacityRef.current);
        }
        // Add any saved custom layers
        customLayersRef.current.forEach((layer) => safeAddCustomLayer(map, layer));
        placeMarkers(L, map);
        geolocateControl.trigger();
      });

      // Click handler — reads overlayLayerRef (never stale)
      map.on("click", async (e: any) => {
        if (exportModeRef.current) return;
        const over = overlayLayerRef.current;
        if (over === "none") return;
        if (over === "trails") {
          trailRequestRef.current?.abort();
          trailPopupRef.current?.remove();
          if (showDetailedTrailPopup(map, e.point, e.lngLat, L.Popup)) return;
          const controller = new AbortController();
          trailRequestRef.current = controller;
          const content = document.createElement("div");
          content.style.cssText = "max-height:300px;overflow-y:auto;color:#0f172a;padding:4px;";
          content.setAttribute("aria-live", "polite");
          content.textContent = map.getZoom() < 12 ? "Zoom in closer, then tap a hiking trail." : "Loading trail information…";
          const popup = new L.Popup({ maxWidth: "300px", closeOnClick: false }).setLngLat(e.lngLat).setDOMContent(content).addTo(map);
          trailPopupRef.current = popup;
          popup.on("close", () => controller.abort());
          if (map.getZoom() < 12) return;
          const corners = [[-20, -20], [-20, 20], [20, -20], [20, 20]].map(([x, y]) => map.unproject([e.point.x + x, e.point.y + y]));
          const bbox = [Math.min(...corners.map((p) => p.lng)), Math.min(...corners.map((p) => p.lat)), Math.max(...corners.map((p) => p.lng)), Math.max(...corners.map((p) => p.lat))];
          const timeout = setTimeout(() => {
            content.textContent = "Trail lookup timed out. Check your connection and tap the trail to retry.";
            controller.abort();
          }, 20000);
          controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
          try {
            const routes = await lookupHikingTrails(bbox, controller.signal);
            if (controller.signal.aborted || overlayLayerRef.current !== "trails") return;
            content.replaceChildren();
            if (!routes.length) content.textContent = "No named hiking route found here. Zoom in and tap a blue USGS trail for local trail details.";
            for (const route of routes) {
              const section = document.createElement("section");
              section.style.marginBottom = "12px";
              const title = document.createElement("strong");
              title.textContent = route.name;
              const distance = document.createElement("p");
              distance.textContent = `Full route: ${route.distance}`;
              const link = document.createElement("a");
              link.textContent = "View route details";
              link.href = `https://hiking.waymarkedtrails.org/#route?id=${route.id}&type=relation`;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              section.append(title, distance, link);
              content.append(section);
            }
            if (routes.length) {
              const note = document.createElement("p");
              note.textContent = "Routes near this point · Full route length, not a planned round trip. Source: Waymarked Trails / OpenStreetMap.";
              note.style.fontSize = "11px";
              content.append(note);
            }
          } catch {
            if (!controller.signal.aborted) content.textContent = "Trail information is unavailable. An internet connection is needed; tap the trail to retry.";
          } finally { clearTimeout(timeout); }
          return;
        }
        const { lng, lat } = e.lngLat;
        setGeoInfo({ loading: true, lngLat: [lng, lat] });

        if (over === "geology") {
          geologyRequestRef.current?.abort();
          const controller = new AbortController();
          geologyRequestRef.current = controller;
          const requestId = ++geologyRequestIdRef.current;
          try {
            const macrostrat = await queryMacrostratGeology(lat, lng, controller.signal);
            if (controller.signal.aborted || requestId !== geologyRequestIdRef.current) return;
            setGeoInfo({ loading: false, lngLat: [lng, lat], macrostrat });
          } catch (error) {
            if (controller.signal.aborted || requestId !== geologyRequestIdRef.current) return;
            setGeoInfo({ loading: false, lngLat: [lng, lat], error: "Geologic unit information is temporarily unavailable." });
          }
        }

        if (over === "soil") {
          try {
            const d = await lookupSoil(lat, lng);
            if (d?.noData) {
              setGeoInfo({ loading: false, lngLat: [lng, lat], data: { Note: "No detailed SSURGO map unit covers this point. USDA coverage is primarily the United States and territories." } });
            } else {
              const info: Record<string, string> = {};
              if (d.mapUnit) info["Map Unit"] = d.mapUnit;
              if (d.soilSeries) info["Soil Series"] = d.soilSeries;
              if (d.taxClass) info["Taxonomic Class"] = d.taxClass;
              if (d.order) info["Order"] = d.order;
              if (d.suborder) info["Suborder"] = d.suborder;
              if (d.drainage) info["Drainage Class"] = d.drainage;
              if (d.slope != null) info["Slope (%)"] = String(d.slope);
              if (d.pctComponent != null) info["Composition"] = `${d.pctComponent}% of map unit`;
              setGeoInfo({ loading: false, lngLat: [lng, lat], data: info });
            }
          } catch {
            setGeoInfo({ loading: false, lngLat: [lng, lat], error: "Soil data unavailable for this location." });
          }
        }
      });
    });

    return () => {
      trailRequestRef.current?.abort();
      trailPopupRef.current?.remove();
      geologyRequestRef.current?.abort();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (popupRef.current) { try { popupRef.current.remove(); } catch {} popupRef.current = null; }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
      mapLoadedRef.current = false;
    };
  }, []); // only once

  // ── BASE LAYER ─────────────────────────────────────────────────────────────
  useEffect(() => {
    baseLayerRef.current = baseLayer;
    if (!mapRef.current || !mapLoadedRef.current) return;
    applyBaseMap(mapRef.current, baseLayer);
  }, [baseLayer]);

  // ── TERRAIN ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    try {
      if (terrain) {
        mapRef.current.setTerrain({ source: "terrain", exaggeration: 1.5 });
        mapRef.current.setMaxPitch(85);
        mapRef.current.easeTo({
          pitch: Math.max(mapRef.current.getPitch(), 62),
          bearing: mapRef.current.getBearing() === 0 ? -25 : mapRef.current.getBearing(),
          duration: 900,
          essential: true,
        });
      } else {
        mapRef.current.setTerrain(null);
        mapRef.current.setMaxPitch(60);
        mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 600, essential: true });
      }
    } catch {}
  }, [terrain]);

  // ── OVERLAY LAYER (dynamic add/remove — no map rebuild needed) ─────────────
  useEffect(() => {
    overlayLayerRef.current = overlayLayer;
    if (!mapRef.current || !mapLoadedRef.current) return;
    const map = mapRef.current;
    safeRemoveOverlays(map);
    if (overlayLayer !== "none") {
      safeAddOverlay(map, overlayLayer, geologyOpacityRef.current);
    }
  }, [overlayLayer]);

  // ── MARKERS ────────────────────────────────────────────────────────────────
  function placeMarkers(L: any, map: any) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (popupRef.current) { try { popupRef.current.remove(); } catch {} }

    const popup = new L.Popup({ closeButton: true, maxWidth: 260 });
    popupRef.current = popup;

    const currentFiltered = (allSamples || []).filter((s) =>
      selectedFolderId === "all" ? true : String(s.folderId ?? "") === String(selectedFolderId)
    );

    const allCoords: [number, number][] = [];

    currentFiltered.forEach((sample) => {
      const coords = parseCoords((sample.fields as any)?.location);
      if (!coords) return;
      allCoords.push([coords[1], coords[0]]);

      const isFutureSite = (sample.fields as any)?.collectionStatus === "planned";
      const color = isFutureSite ? "#f59e0b" : TYPE_COLORS[sample.sampleType] || "#666";
      const label = getSampleLabel(sample);
      const letter = sample.sampleType === "water" ? "W" : sample.sampleType === "rock" ? "R" : sample.sampleType === "air" ? "A" : sample.sampleType === "other" ? String(label).charAt(0).toUpperCase() || "O" : "S";
      const dateStr = (sample.fields as any)?.collectionDate
        ? new Date((sample.fields as any).collectionDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        : "";
      // Show only the first media slot in the popup
      const fields = sample.fields as any;
      const firstMedia = Array.isArray(fields?.media) ? fields.media[0] : null;
      const photoHtml = firstMedia?.type === "video"
        ? `<video src="${firstMedia.dataUrl}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px;border:none;" muted playsinline controls></video>`
        : firstMedia?.type === "photo"
          ? `<img src="${firstMedia.dataUrl}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px;"/>`
          : fields?.photo
            ? `<img src="${fields.photo}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px;"/>`
            : "";

      const el = document.createElement("div");
      el.innerHTML = isFutureSite
        ? `<div aria-label="Future sample site" style="background:${color};border-radius:50%;width:20px;height:20px;border:3px solid white;box-shadow:0 2px 7px rgba(0,0,0,0.4);cursor:pointer;"></div>`
        : `<div style="background:${color};color:white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;"><span style="transform:rotate(45deg);font-size:14px;font-weight:700;">${letter}</span></div>`;
      const marker = new L.Marker({ element: el, anchor: "bottom" }).setLngLat([coords[1], coords[0]]).addTo(map);

      el.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        if (exportModeRef.current) return;
        popup
          .setLngLat([coords[1], coords[0]])
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;min-width:180px;">
              ${photoHtml}
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span style="background:${color};color:white;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">${label}</span>
                <strong style="font-size:13px;">${sample.sampleId}</strong>
              </div>
              ${dateStr ? `<div style="font-size:11px;color:#666;margin-bottom:3px;">📅 ${dateStr}</div>` : ""}
              <div style="font-size:11px;color:#666;">📍 ${formatCoord(coords[0])}, ${formatCoord(coords[1])}</div>
              <a href="/sample/${sample.id}" style="display:block;margin-top:10px;background:${color};color:white;text-align:center;border-radius:6px;padding:5px;font-size:12px;text-decoration:none;font-weight:600;">View Sample →</a>
            </div>
          `)
          .addTo(map);
      });

      markersRef.current.push(marker);
    });

    const currentMeasurements = measurements.filter((measurement) =>
      selectedFolderId === "all" ? true : String(measurement.datasetId ?? "") === String(selectedFolderId)
    );
    currentMeasurements.forEach((measurement) => {
      const coords = measurementCoords(measurement);
      if (!coords) return;
      allCoords.push([coords[1], coords[0]]);

      const isLineation = measurement.measurementType === "lineation";
      const bearing = isLineation
        ? measurement.trendDegrees ?? 0
        : Number.isFinite(measurement.strikeDegrees)
          ? measurement.strikeDegrees!
          : Number.parseFloat(measurement.strike) || 0;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${isLineation ? "Lineation" : "Strike and dip"} measurement ${measurement.label || measurement.strike}`);
      el.style.cssText = "width:42px;height:42px;border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));";
      el.innerHTML = `
        <svg viewBox="0 0 42 42" width="42" height="42" aria-hidden="true">
          <circle cx="21" cy="21" r="18" fill="rgba(255,255,255,.88)" stroke="#7c3aed" stroke-width="2"/>
          <g transform="rotate(${bearing} 21 21)">
            <path d="${isLineation ? "M21 34V8 M15 14L21 8L27 14" : "M21 7V35 M21 21H34"}" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${isLineation ? "M21 34V8 M15 14L21 8L27 14" : "M21 7V35 M21 21H34"}" fill="none" stroke="#4c1d95" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </g>
        </svg>`;
      const marker = new L.Marker({ element: el, anchor: "center", rotationAlignment: "map" })
        .setLngLat([coords[1], coords[0]])
        .addTo(map);
      el.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        if (exportModeRef.current) return;
        popup
          .setLngLat([coords[1], coords[0]])
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;min-width:190px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="color:#4c1d95;font-size:22px;font-weight:800;">${isLineation ? "↑" : "⊢"}</span>
                <div><strong style="font-size:13px;">${escapeHtml(measurement.label || (isLineation ? "Lineation" : "Strike & Dip"))}</strong><div style="font-size:10px;color:#7c3aed;font-weight:700;text-transform:uppercase;">Structural measurement</div></div>
              </div>
              ${isLineation
                ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Azimuth:</strong> ${Math.round(measurement.trendDegrees ?? 0)}° &nbsp; <strong>Plunge:</strong> ${Math.round(measurement.plungeDegrees ?? 0)}°</div>`
                : `<div style="font-size:12px;margin-bottom:4px;"><strong>Strike:</strong> ${escapeHtml(measurement.strike)} &nbsp; <strong>Dip:</strong> ${escapeHtml(measurement.dip)}</div>`}
              ${!isLineation && measurement.dipDir ? `<div style="font-size:11px;color:#666;margin-bottom:4px;"><strong>Dip direction:</strong> ${escapeHtml(measurement.dipDir)}</div>` : ""}
              ${measurement.featureType ? `<div style="font-size:11px;color:#666;margin-bottom:4px;"><strong>Feature:</strong> ${escapeHtml(measurement.featureType)}</div>` : ""}
              <div style="font-size:11px;color:#666;">📍 ${formatCoord(coords[0])}, ${formatCoord(coords[1])}</div>
              <a href="/strike-dip" style="display:block;margin-top:10px;background:#7c3aed;color:white;text-align:center;border-radius:6px;padding:6px;font-size:12px;text-decoration:none;font-weight:600;">View Measurements →</a>
            </div>`)
          .addTo(map);
      });
      markersRef.current.push(marker);
    });

    if (allCoords.length === 1) {
      map.flyTo({ center: allCoords[0], zoom: 13 });
    } else if (allCoords.length > 1) {
      const lngs = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80 }
      );
    }
  }

  useEffect(() => {
    if (!mapRef.current) return;
    import("maplibre-gl").then((L) => {
      if (!mapRef.current) return;
      if (mapLoadedRef.current) {
        placeMarkers(L, mapRef.current);
      } else {
        mapRef.current.once("load", () => {
          if (mapRef.current) placeMarkers(L, mapRef.current);
        });
      }
    });
  }, [allSamples, measurements, selectedFolderId]);

  function focusSample(coords: [number, number]) {
    setSelectedFolderId("all");
    setSampleSearch("");
    setAddressLookupError("");
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [coords[1], coords[0]],
      zoom: terrain ? 14 : Math.max(mapRef.current.getZoom?.() ?? 0, 16),
      pitch: terrain ? 64 : 0,
      bearing: terrain ? -25 : 0,
      essential: true,
    });
  }

  function focusAddress(result: GeocodeResult) {
    setSelectedFolderId("all");
    setSampleSearch("");
    setAddressSuggestions([]);
    setAddressLookupError("");
    mapRef.current?.flyTo({
      center: [result.lng, result.lat],
      zoom: terrain ? 13.5 : 16,
      pitch: terrain ? 64 : 0,
      bearing: terrain ? -25 : 0,
      essential: true,
    });
  }

  async function handleMapSearch(event?: React.FormEvent) {
    event?.preventDefault();
    const query = sampleSearch.trim();
    if (!query || !mapRef.current) return;

    const exactSample = searchableSamples.find(({ sample }) =>
      String(sample.sampleId || "").toLowerCase() === query.toLowerCase()
    );
    if (exactSample?.coords) {
      focusSample(exactSample.coords);
      return;
    }

    setAddressLookupLoading(true);
    setAddressLookupError("");
    try {
      const result = await geocodeAddress(query);
      if (!result) {
        setAddressLookupError("Address not found.");
        return;
      }
      focusAddress(result);
    } catch {
      setAddressLookupError("Address lookup failed.");
    } finally {
      setAddressLookupLoading(false);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display flex items-center gap-3">
              <MapPin className="text-primary w-8 h-8" />
              Geological Map
            </h1>
            <p className="text-muted-foreground mt-1">
              {samplesWithCoords.length} sample{samplesWithCoords.length !== 1 ? "s" : ""} and {measurementsWithCoords.length} structural measurement{measurementsWithCoords.length !== 1 ? "s" : ""} plotted
              {selectedFolderId !== "all" && (
                <span className="ml-1">from <strong>{allFolders.find((f: any) => String(f.id) === String(selectedFolderId))?.name}</strong></span>
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={startMapExport} disabled={exportBusy || exportMode}>Export</Button>
            <form className="relative" onSubmit={handleMapSearch}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={sampleSearch}
                onChange={(e) => { setSampleSearch(e.target.value); setAddressLookupError(""); }}
                placeholder="Find sample or address..."
                className="h-9 pl-8 pr-9 w-full sm:w-64 bg-card"
              />
              <button
                type="submit"
                disabled={addressLookupLoading || !sampleSearch.trim()}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Search map"
              >
                {addressLookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
              </button>
              {(searchMatches.length > 0 || addressSuggestions.length > 0 || suggestionsLoading) && (
                <div className="absolute right-0 top-10 z-30 w-full sm:w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                  {searchMatches.length > 0 && <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Samples</div>}
                  {searchMatches.map(({ sample, coords }) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => coords && focusSample(coords)}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/50 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{sample.sampleId}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatCoord(coords![0])}, {formatCoord(coords![1])}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{getSampleLabel(sample)}</p>
                    </button>
                  ))}
                  {(addressSuggestions.length > 0 || suggestionsLoading) && <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address options</div>}
                  {suggestionsLoading && <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Finding matching places…</div>}
                  {!suggestionsLoading && addressSuggestions.map((result, index) => (
                    <button key={`${result.lat}-${result.lng}-${index}`} type="button" onClick={() => focusAddress(result)} className="flex w-full items-start gap-2 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="text-xs leading-4 text-foreground">{result.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {addressLookupError && (
                <div className="absolute right-0 top-10 z-30 w-full sm:w-72 rounded-lg border border-destructive/20 bg-card px-3 py-2 text-xs text-destructive shadow-lg">
                  {addressLookupError}
                </div>
              )}
            </form>
            <div className="relative">
              <select
                className="flex items-center pl-8 pr-4 h-9 rounded-lg border border-border bg-card text-sm font-medium shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none w-full sm:w-auto"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value === "all" ? "all" : e.target.value)}
              >
                <option value="all">All Datasets</option>
                {allFolders.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Base layer */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 shadow-sm">
            {(["satellite", "street", "topographic"] as const).map((bl) => (
              <button
                key={bl}
                onClick={() => setBaseLayer(bl)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${baseLayer === bl ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                {bl === "satellite" ? <Satellite className="w-3.5 h-3.5" /> : bl === "topographic" ? <Mountain className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
                {bl === "topographic" ? "USGS Topo" : bl.charAt(0).toUpperCase() + bl.slice(1)}
              </button>
            ))}
          </div>

          {/* Terrain */}
          <button
            onClick={() => setTerrain((enabled) => !enabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-sm ${terrain ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Mountain className="w-3.5 h-3.5" />
            {terrain ? "3D Terrain" : "2D Map"}
          </button>

          {/* Overlay */}
          <div className="relative">
            <select
              className="flex items-center pl-8 pr-4 h-9 rounded-lg border border-border bg-card text-sm font-medium shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
              value={overlayLayer}
              onChange={(e) => { setOverlayLayer(e.target.value as OverlayLayer); setGeoInfo(null); }}
            >
              <option value="none">No Overlay</option>
              <option value="geology">Regional Geology</option>
              <option value="soil">Soil Types</option>
              <option value="trails">Hiking Trails (Waymarked)</option>
            </select>
            <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          {overlayLayer === "geology" && (
            <label className="flex min-w-36 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              Geology opacity
              <input aria-label="Geology opacity" type="range" min="0" max="1" step="0.05" value={geologyOpacity} onChange={(event) => setGeologyOpacity(Number(event.target.value))} className="w-20 accent-primary" />
              <span className="w-8 tabular-nums">{Math.round(geologyOpacity * 100)}%</span>
            </label>
          )}

          {/* Insert Map Layer */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setNewLayerName(""); setNewLayerColor("#e63946");
              setNewLayerGeoJson(null); setNewLayerFileName(""); setNewLayerFileSummary(""); setNewLayerError("");
              setLayerModalOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Insert Map Layer
          </Button>

          {/* Legend */}
          <div className="flex gap-3 ml-auto flex-wrap">
            {Object.entries(TYPE_COLORS)
              .filter(([type]) => type !== "air" || hasLegacyAirSamples)
              .map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5 text-sm">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{TYPE_LABELS[type]}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-sm">
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <path d="M10 2v16M10 10h8" fill="none" stroke="#4c1d95" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="text-muted-foreground">Strike/Dip</span>
            </div>
          </div>
        </div>

        {customLayers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customLayers.map((layer) => (
              <div
                key={layer.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium"
                style={{ borderColor: layer.color + "99", backgroundColor: layer.color + "18" }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                <span>{layer.name}</span>
                <button
                  onClick={() => {
                    if (!requireAccountForSave(authData?.user, setLocation, "/map")) return;
                    if (!confirm(`Remove the "${layer.name}" layer?`)) return;
                    deleteCustomLayer(layer.id);
                  }}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove layer"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {overlayLayer !== "none" && (
          <div className="text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
            {overlayLayer === "geology"
              ? "Click anywhere to get rock formation and geological age data."
              : overlayLayer === "trails" ? "Zoom in for smaller U.S. trails. Tap blue trails for segment details or marked routes for route information." : "Click a visible USDA soil map unit to get SSURGO classification data (US coverage)."}
          </div>
        )}

      </div>

      {/* Map + info panel */}
      {exportMode && (
        <div className="mb-3 rounded-xl border border-border bg-card p-3 space-y-2">
          <p className="text-sm">Pan and zoom the map to frame your picture, then select Preview image.</p>
          <div className="flex gap-2">
            <Button onClick={prepareMapExport} disabled={exportBusy}>{exportBusy ? "Preparing…" : "Preview image"}</Button>
            <Button variant="outline" disabled={exportBusy} onClick={() => { setExportMode(false); setExportError(""); }}>Cancel</Button>
          </div>
          {exportError && !exportImage && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
        </div>
      )}
      <div
        className={mapFullScreen ? "geofield-fullscreen-map absolute inset-0 z-[90] flex bg-background" : "relative flex gap-4"}
        style={{
          height: mapFullScreen ? "100%" : "calc(100vh - 320px)",
          minHeight: mapFullScreen ? 0 : "400px",
        }}
      >
        {geoInfo && (
          <div className="w-72 shrink-0 bg-card border border-border rounded-2xl shadow-lg overflow-y-auto p-5 space-y-3 z-10">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold font-display text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {overlayLayer === "geology" ? "Rock Formation" : overlayLayer === "trails" ? "Trail Info" : "Soil Data"}
              </h3>
              <button onClick={() => setGeoInfo(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>
            {geoInfo.lngLat && (
              <p className="text-xs text-muted-foreground">📍 {formatCoord(geoInfo.lngLat[1])}, {formatCoord(geoInfo.lngLat[0])}</p>
            )}
            {geoInfo.loading && (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}</div>
            )}
            {geoInfo.error && <p className="text-sm text-destructive">{geoInfo.error}</p>}
            {overlayLayer === "geology" && !geoInfo.loading && !geoInfo.error && (
              <MacrostratGeologyInfo selection={geoInfo.macrostrat ?? null} />
            )}
            {overlayLayer !== "geology" && geoInfo.data && !geoInfo.loading && (
              <div className="space-y-2.5">
                {Object.entries(geoInfo.data).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{k}</p>
                    <p className="text-sm text-foreground mt-0.5">{v || "—"}</p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Source: USDA SSURGO
                </p>
              </div>
            )}
          </div>
        )}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className={`h-full w-full overflow-hidden border border-border shadow-lg ${mapFullScreen ? "rounded-none" : "rounded-2xl"}`} />
          {!exportMode && <button type="button" onClick={() => { setGeoInfo(null); setMapFullScreen((value) => !value); }} className="absolute left-3 top-3 z-[110] flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted" title={mapFullScreen ? "Return to normal map size" : "Make map full screen"} aria-label={mapFullScreen ? "Exit full-screen map" : "Open full-screen map"}>
            {mapFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {mapFullScreen ? "Exit Full Screen" : "Full Screen"}
          </button>}
          {exportBusy && <div className="absolute inset-0 z-[120] cursor-wait bg-black/10" aria-label="Preparing map image" />}
          {terrain && (
            <div className="pointer-events-none absolute bottom-7 left-3 right-3 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-lg bg-black/65 px-3 py-1.5 text-center text-xs text-white shadow backdrop-blur-sm">
              Two-finger drag tilts · twist rotates · use the right-side arrows for precise tilt
            </div>
          )}
        </div>
      </div>

      {exportImage && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Map export preview">
          <div className="w-full max-w-3xl rounded-xl bg-card p-4 space-y-3 max-h-[90dvh] overflow-auto">
            <h2 className="text-lg font-semibold">Map export preview</h2>
            <img src={exportImage.url} alt="Map image ready to export" className="max-h-[60dvh] w-full object-contain" />
            <p className="text-sm text-muted-foreground">Save as a PNG picture. On iPhone, choose Save to Files in the share menu.</p>
            {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
            <div className="flex gap-2">
              <Button disabled={exportBusy} onClick={saveMapExport}>Save image</Button>
              <Button disabled={exportBusy} variant="outline" onClick={() => { setExportImage(null); setExportError(""); }}>Adjust map</Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for custom map layer upload */}
      <input
        ref={layerFileInputRef}
        type="file"
        accept={SUPPORTED_LAYER_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = "";
          setNewLayerFileName(file.name);
          setNewLayerFileSummary("");
          try {
            const parsed = await parseCustomLayerFile(file);
            setNewLayerGeoJson(parsed.geojson);
            setNewLayerFileSummary(`${parsed.kind} · ${parsed.featureCount} feature${parsed.featureCount === 1 ? "" : "s"}`);
            setNewLayerError("");
          } catch (error) {
            setNewLayerGeoJson(null);
            setNewLayerError(error instanceof Error ? error.message : "Invalid map layer file. Please check the file and try again.");
          }
        }}
      />

      {/* Insert Map Layer modal */}
      {layerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Insert Map Layer
              </h2>
              <button
                type="button"
                onClick={() => setLayerModalOpen(false)}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close map layer popup"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload a GeoJSON, KML, GPX, CSV, or TSV file to overlay on the map. CSV files need latitude and longitude columns.
            </p>

            <div className="space-y-1">
              <Label className="text-xs">Layer Name</Label>
              <Input
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                placeholder="e.g. Fault lines, Sample zones, Survey boundary"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Layer Color</Label>
              <div className="flex gap-2 flex-wrap">
                {["#e63946","#2d7dd2","#06d6a0","#ffd166","#9b5de5","#f77f00","#4cc9f0","#8b5e3c"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewLayerColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${newLayerColor === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={newLayerColor}
                  onChange={(e) => setNewLayerColor(e.target.value)}
                  className="w-8 h-8 rounded-full border-2 border-border cursor-pointer"
                  title="Custom color"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Map Layer File</Label>
              <button
                type="button"
                onClick={() => layerFileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-border rounded-xl hover:border-primary transition-colors text-muted-foreground hover:text-primary"
              >
                {newLayerFileName ? (
                  <>
                    <p className="text-sm font-medium text-foreground">{newLayerFileName}</p>
                    {newLayerFileSummary && <p className="text-xs text-muted-foreground">{newLayerFileSummary}</p>}
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6" />
                    <p className="text-sm">Click to upload .geojson, .kml, .gpx, .csv, or .tsv</p>
                  </>
                )}
              </button>
            </div>

            {newLayerError && (
              <p className="text-sm text-destructive">{newLayerError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                className="flex-1"
                disabled={!newLayerName.trim() || !newLayerGeoJson}
                onClick={() => {
                  if (!newLayerName.trim() || !newLayerGeoJson) return;
                  if (!requireAccountForSave(authData?.user, setLocation, "/map")) return;
                  const layer: CustomMapLayer = {
                    id: crypto.randomUUID(),
                    name: newLayerName.trim(),
                    color: newLayerColor,
                    geojson: newLayerGeoJson,
                    createdAt: new Date().toISOString(),
                  };
                  addCustomLayer(layer);
                  setLayerModalOpen(false);
                  setNewLayerGeoJson(null);
                  setNewLayerFileName("");
                  setNewLayerFileSummary("");
                }}
              >
                Add to Map
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setLayerModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
