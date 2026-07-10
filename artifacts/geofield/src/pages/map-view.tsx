import { useState, useEffect, useMemo, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useGetSamples, useGetFolders } from "@workspace/api-client-react";
import { MapPin, FolderOpen, AlertCircle, Layers, Satellite, Map as MapIcon, Mountain, Plus, Upload, X as XIcon, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadCustomLayers, addCustomLayer, deleteCustomLayer, safeAddCustomLayer, safeRemoveCustomLayer, type CustomMapLayer } from "@/lib/custom-layers";
import { getQueue, QUEUE_UPDATED_EVENT } from "@/lib/offline-queue";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";
import { geocodeAddress } from "@/lib/geocoding";
import "maplibre-gl/dist/maplibre-gl.css";

const TYPE_COLORS: Record<string, string> = {
  water: "#2d7dd2",
  rock: "#8b5e3c",
  soil_sand: "#c49a3c",
  air: "#1f9d8a",
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

function getSampleLabel(sample: any) {
  if (sample.sampleType === "other") {
    return sample.fields?.otherSampleTitle || sample.fields?.title || sample.sampleId || "Other";
  }
  return TYPE_LABELS[sample.sampleType] || sample.sampleType || "Sample";
}

type BaseLayer = "street" | "satellite";
type OverlayLayer = "none" | "geology" | "soil" | "trails";

const USGS_IMAGERY_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
const USGS_TOPO_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const GEO_TILES    = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const TRAILS_TILES = "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png";
const SOIL_WMS =
  "https://maps.isric.org/mapserv?map=/map/wrb.map&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=TRUE&LAYERS=MostProbable&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX={bbox-epsg-3857}";

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
      tiles: [USGS_IMAGERY_TILES],
      tileSize: 256,
      attribution: "USGS The National Map, USDA NAIP",
      maxzoom: 16,
    },
    street: {
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
  ],
  terrain: { source: "terrain", exaggeration: 1.5 },
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
  for (const id of ["geology-overlay", "soil-overlay", "trails-overlay"]) {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
  }
  for (const id of ["geology", "soil", "trails-src"]) {
    try { if (map.getSource(id)) map.removeSource(id); } catch {}
  }
}

function safeAddOverlay(map: any, overlay: OverlayLayer) {
  try {
    if (overlay === "geology") {
      map.addSource("geology", { type: "raster", tiles: [GEO_TILES], tileSize: 256, attribution: "© Macrostrat" });
      map.addLayer({ id: "geology-overlay", type: "raster", source: "geology", paint: { "raster-opacity": 0.65 } });
    } else if (overlay === "soil") {
      map.addSource("soil", { type: "raster", tiles: [SOIL_WMS], tileSize: 256, attribution: "© ISRIC" });
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
    }
  } catch {}
}

interface GeoInfo {
  loading: boolean;
  data?: Record<string, string> | null;
  error?: string;
  lngLat?: [number, number];
}

export default function MapViewPage() {
  const [selectedFolderId, setSelectedFolderId] = useState<number | string | "all">("all");
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const [overlayLayer, setOverlayLayer] = useState<OverlayLayer>("none");
  const [terrain, setTerrain] = useState(true);
  const [geoInfo, setGeoInfo] = useState<GeoInfo | null>(null);
  const [customLayers, setCustomLayers] = useState<CustomMapLayer[]>(loadCustomLayers);
  const [queuedSamples, setQueuedSamples] = useState(getQueue);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);
  const [sampleSearch, setSampleSearch] = useState("");
  const [addressLookupLoading, setAddressLookupLoading] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState("");
  const [layerModalOpen, setLayerModalOpen] = useState(false);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerColor, setNewLayerColor] = useState("#e63946");
  const [newLayerGeoJson, setNewLayerGeoJson] = useState<string | null>(null);
  const [newLayerError, setNewLayerError] = useState("");
  const [newLayerFileName, setNewLayerFileName] = useState("");

  const { data: folders } = useGetFolders();
  const { data: serverSamples } = useGetSamples();
  const offlineSamples = useMemo(() => queuedSamples.map((item: any, index: number) => ({
    id: item.queuedId || `offline-${index}`,
    ...item.payload,
    offline: true,
    queuedAt: item.queuedAt,
  })), [queuedSamples]);
  const allSamples = useMemo(() => [...(serverSamples || []), ...offlineSamples], [serverSamples, offlineSamples]);
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
  const mapLoadedRef = useRef(false);

  const filteredSamples = (allSamples || []).filter((s) =>
    selectedFolderId === "all" ? true : String(s.folderId ?? "") === String(selectedFolderId)
  );
  const samplesWithCoords = filteredSamples.filter((s) => parseCoords((s.fields as any)?.location));
  const samplesWithoutCoords = filteredSamples.filter((s) => !parseCoords((s.fields as any)?.location));
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

  // Keep overlayLayerRef in sync with state
  useEffect(() => {
    overlayLayerRef.current = overlayLayer;
  }, [overlayLayer]);

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
    const refreshDatasets = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
    window.addEventListener("storage", refreshDatasets);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refreshDatasets);
      window.removeEventListener("storage", refreshDatasets);
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
        style: INITIAL_STYLE,
        center: [-98.35, 39.5],
        zoom: 4,
        pitch: 40,
        maxPitch: 85,
        attributionControl: {},
      });
      mapRef.current = map;

      map.addControl(new L.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new L.ScaleControl(), "bottom-left");

      map.on("load", () => {
        mapLoadedRef.current = true;
        if (overlayLayerRef.current !== "none") {
          safeAddOverlay(map, overlayLayerRef.current);
        }
        // Add any saved custom layers
        customLayersRef.current.forEach((layer) => safeAddCustomLayer(map, layer));
        placeMarkers(L, map);
      });

      // Click handler — reads overlayLayerRef (never stale)
      map.on("click", async (e: any) => {
        const over = overlayLayerRef.current;
        if (over === "none" || over === "trails") return;
        const { lng, lat } = e.lngLat;
        setGeoInfo({ loading: true, lngLat: [lng, lat] });

        if (over === "geology") {
          try {
            const r = await fetch(
              `https://macrostrat.org/api/v2/geologic_units/burwell?lat=${lat}&lng=${lng}&response=short`
            );
            const d = await r.json();
            const unit = d?.success?.data?.[0];
            if (unit) {
              setGeoInfo({
                loading: false,
                lngLat: [lng, lat],
                data: {
                  Formation: unit.strat_name_long || unit.map_unit_name || "Unknown",
                  Age: [unit.t_int_name, unit.b_int_name].filter(Boolean).join(" – ") || "—",
                  Era: unit.era || "—",
                  Lithology: unit.lith || "—",
                  Description: unit.descrip || "—",
                },
              });
            } else {
              setGeoInfo({ loading: false, lngLat: [lng, lat], data: { Note: "No formation data at this location." } });
            }
          } catch {
            setGeoInfo({ loading: false, lngLat: [lng, lat], error: "Failed to load geological data." });
          }
        }

        if (over === "soil") {
          try {
            const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
            const r = await fetch(`${base}/api/proxy/soil?lat=${lat}&lng=${lng}`);
            const d = await r.json();
            if (d?.noData || d?.error) {
              setGeoInfo({ loading: false, lngLat: [lng, lat], data: { Note: "No USDA soil data here. Coverage is US-only." } });
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
    if (!mapRef.current || !mapLoadedRef.current) return;
    try {
      mapRef.current.setLayoutProperty("satellite-layer", "visibility", baseLayer === "satellite" ? "visible" : "none");
      mapRef.current.setLayoutProperty("street-layer", "visibility", baseLayer === "street" ? "visible" : "none");
    } catch {}
  }, [baseLayer]);

  // ── TERRAIN ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    try {
      if (terrain) {
        mapRef.current.setTerrain({ source: "terrain", exaggeration: 1.5 });
        mapRef.current.setMaxPitch(85);
      } else {
        mapRef.current.setTerrain(null);
        mapRef.current.setMaxPitch(60);
        mapRef.current.setPitch(0);
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
      safeAddOverlay(map, overlayLayer);
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

      const color = TYPE_COLORS[sample.sampleType] || "#666";
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
      el.innerHTML = `<div style="background:${color};color:white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;"><span style="transform:rotate(45deg);font-size:14px;font-weight:700;">${letter}</span></div>`;
      const marker = new L.Marker({ element: el, anchor: "bottom" }).setLngLat([coords[1], coords[0]]).addTo(map);

      el.addEventListener("click", (e: Event) => {
        e.stopPropagation();
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
  }, [allSamples, selectedFolderId]);

  function focusSample(coords: [number, number]) {
    setSelectedFolderId("all");
    setSampleSearch("");
    setAddressLookupError("");
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [coords[1], coords[0]],
      zoom: Math.max(mapRef.current.getZoom?.() ?? 0, 16),
      pitch: terrain ? 45 : 0,
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
      setSelectedFolderId("all");
      setSampleSearch("");
      mapRef.current.flyTo({
        center: [result.lng, result.lat],
        zoom: 16,
        pitch: terrain ? 45 : 0,
        essential: true,
      });
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
              3D Geological Map
            </h1>
            <p className="text-muted-foreground mt-1">
              {samplesWithCoords.length} sample{samplesWithCoords.length !== 1 ? "s" : ""} plotted
              {selectedFolderId !== "all" && (
                <span className="ml-1">from <strong>{allFolders.find((f: any) => String(f.id) === String(selectedFolderId))?.name}</strong></span>
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
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
              {searchMatches.length > 0 && (
                <div className="absolute right-0 top-10 z-30 w-full sm:w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
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
            {(["satellite", "street"] as const).map((bl) => (
              <button
                key={bl}
                onClick={() => setBaseLayer(bl)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${baseLayer === bl ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                {bl === "satellite" ? <Satellite className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
                {bl.charAt(0).toUpperCase() + bl.slice(1)}
              </button>
            ))}
          </div>

          {/* Terrain */}
          <button
            onClick={() => setTerrain(!terrain)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-sm ${terrain ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Mountain className="w-3.5 h-3.5" />
            3D Terrain
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

          {/* Insert Map Layer */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setNewLayerName(""); setNewLayerColor("#e63946");
              setNewLayerGeoJson(null); setNewLayerFileName(""); setNewLayerError("");
              setLayerModalOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Insert Map Layer
          </Button>

          {/* Legend */}
          <div className="flex gap-3 ml-auto flex-wrap">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5 text-sm">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{TYPE_LABELS[type]}</span>
              </div>
            ))}
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
              : "Click anywhere to get soil classification data (USDA SSURGO, US coverage only)."}
          </div>
        )}
        {samplesWithoutCoords.length > 0 && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>{samplesWithoutCoords.length} sample{samplesWithoutCoords.length !== 1 ? "s" : ""} not shown</strong>{" "}
              — no GPS: {samplesWithoutCoords.map((s) => s.sampleId).join(", ")}.
              Edit those samples and enter <em>lat, lng</em>.
            </span>
          </div>
        )}
      </div>

      {/* Map + info panel */}
      <div className="relative flex gap-4" style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}>
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
            {geoInfo.data && !geoInfo.loading && (
              <div className="space-y-2.5">
                {Object.entries(geoInfo.data).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{k}</p>
                    <p className="text-sm text-foreground mt-0.5">{v || "—"}</p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  {overlayLayer === "geology" ? "Source: Macrostrat" : "Source: USDA SSURGO"}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full rounded-2xl overflow-hidden border border-border shadow-lg" />
        </div>
      </div>

      {/* Hidden file input for GeoJSON upload */}
      <input
        ref={layerFileInputRef}
        type="file"
        accept=".geojson,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = "";
          setNewLayerFileName(file.name);
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const text = ev.target?.result as string;
              JSON.parse(text);
              setNewLayerGeoJson(text);
              setNewLayerError("");
            } catch {
              setNewLayerGeoJson(null);
              setNewLayerError("Invalid GeoJSON — please check the file and try again.");
            }
          };
          reader.readAsText(file);
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
              <button onClick={() => setLayerModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload a GeoJSON file to overlay on the map. The layer will also appear in trip planning. Photos are not included in the export.
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
              <Label className="text-xs">GeoJSON File</Label>
              <button
                type="button"
                onClick={() => layerFileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-border rounded-xl hover:border-primary transition-colors text-muted-foreground hover:text-primary"
              >
                {newLayerFileName ? (
                  <p className="text-sm font-medium text-foreground">{newLayerFileName}</p>
                ) : (
                  <>
                    <Upload className="w-6 h-6" />
                    <p className="text-sm">Click to upload .geojson or .json</p>
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
                  const layer: CustomMapLayer = {
                    id: crypto.randomUUID(),
                    name: newLayerName.trim(),
                    color: newLayerColor,
                    geojson: newLayerGeoJson,
                    createdAt: new Date().toISOString(),
                  };
                  addCustomLayer(layer);
                  setLayerModalOpen(false);
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
