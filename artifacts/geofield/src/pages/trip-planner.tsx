import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  MapPin, Plus, Trash2, Save, Map, X, Navigation, Edit3, Bookmark,
  Layers, Satellite, Mountain,
} from "lucide-react";
import { loadCustomLayers, safeAddCustomLayer, safeRemoveCustomLayer, deleteCustomLayer, type CustomMapLayer } from "@/lib/custom-layers";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createTripDataset, deleteLocalDataset, updateLocalDataset } from "@/lib/local-datasets";
import { getQueue, setQueue, type QueuedSample } from "@/lib/offline-queue";
import "maplibre-gl/dist/maplibre-gl.css";

// ── Types ──────────────────────────────────────────────────────────────────────
type BaseLayer    = "street" | "satellite";
type OverlayLayer = "none" | "geology" | "soil" | "trails";

const USGS_IMAGERY_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
const USGS_TOPO_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const GEO_TILES    = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const TRAILS_TILES = "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png";
const SOIL_WMS     =
  "https://maps.isric.org/mapserv?map=/map/wrb.map&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=TRUE&LAYERS=MostProbable&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&BBOX={bbox-epsg-3857}";

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
      map.addLayer({ id: "geology-overlay", type: "raster", source: "geology", paint: { "raster-opacity": 0.65 } }, "labels");
    } else if (overlay === "soil") {
      map.addSource("soil", { type: "raster", tiles: [SOIL_WMS], tileSize: 256, attribution: "© ISRIC" });
      map.addLayer({ id: "soil-overlay", type: "raster", source: "soil", paint: { "raster-opacity": 0.65 } }, "labels");
    } else if (overlay === "trails") {
      map.addSource("trails-src", {
        type: "raster",
        tiles: [TRAILS_TILES],
        tileSize: 256,
        attribution: "© <a href='https://www.waymarkedtrails.org'>Waymarked Trails</a>, © OpenStreetMap contributors",
        minzoom: 5,
      });
      map.addLayer({ id: "trails-overlay", type: "raster", source: "trails-src", paint: { "raster-opacity": 0.9 } }, "labels");
    }
  } catch {}
}

// ── Trip data types ───────────────────────────────────────────────────────────
export interface PlannedSite {
  id: string;
  name: string;
  description: string;
  sampleType?: "water" | "rock" | "soil_sand" | "air" | "other";
  lat: number;
  lng: number;
  addedAt: string;
  queuedSampleId?: string;
}

export interface Trip {
  id: string;
  name: string;
  notes: string;
  sites: PlannedSite[];
  createdAt: string;
  updatedAt: string;
  datasetId?: number;
}

const TRIPS_KEY = "geofield_trips";

export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(TRIPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveTrips(trips: Trip[]) {
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  window.dispatchEvent(new CustomEvent("trips-updated"));
}

const MAP_MODAL_HEIGHT = "90vh";

function formatCoord(value: number) {
  return value.toFixed(7);
}

function siteSampleId(siteName: string, siteIndex: number) {
  const slug = siteName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18);
  return slug ? `SITE-${siteIndex + 1}-${slug}` : `SITE-${siteIndex + 1}`;
}

function plannedSiteTitle(site: PlannedSite) {
  const sampleType = site.sampleType ?? "other";
  if (sampleType === "water") return "Water";
  if (sampleType === "rock") return "Rock";
  if (sampleType === "soil_sand") return "Soil / Sediment";
  if (sampleType === "air") return "Air";
  return site.name;
}

function plannedSiteSampleTypeLabel(site: PlannedSite) {
  const sampleType = site.sampleType ?? "other";
  if (sampleType === "water") return "Water";
  if (sampleType === "rock") return "Rock";
  if (sampleType === "soil_sand") return "Soil / Sediment";
  if (sampleType === "air") return "Air";
  return "Other";
}

// ── Initial map style (mirrors map-view.tsx) ──────────────────────────────────
const TRIP_MAP_STYLE: any = {
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
    labels: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "© Esri",
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
    { id: "street-layer",    type: "raster", source: "street",    layout: { visibility: "none"    } },
    // overlays inserted dynamically before "labels"
    { id: "labels",          type: "raster", source: "labels",    layout: { visibility: "visible" } },
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

// ── Component ──────────────────────────────────────────────────────────────────
export default function TripPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [, setLocation] = useLocation();
  const [trips, setTrips] = useState<Trip[]>(loadTrips);
  const [mapOpen, setMapOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  // Map layer state
  const [baseLayer,    setBaseLayer]    = useState<BaseLayer>("satellite");
  const [terrain,      setTerrain]      = useState(true);
  const [overlayLayer, setOverlayLayer] = useState<OverlayLayer>("none");
  const [customLayers, setCustomLayers] = useState<CustomMapLayer[]>(loadCustomLayers);

  // Map refs
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapInstanceRef   = useRef<any>(null);
  const mapMarkersRef    = useRef<any[]>([]);
  const mapLoadedRef     = useRef(false);
  const overlayLayerRef  = useRef<OverlayLayer>("none");
  const pinModeRef       = useRef(false);
  const customLayersRef  = useRef<CustomMapLayer[]>(loadCustomLayers());

  // Interaction state
  const [pinMode,         setPinMode]         = useState(false);
  const [geoInfo,         setGeoInfo]         = useState<{ loading: boolean; data?: Record<string, string> | null; error?: string; lngLat?: [number, number] } | null>(null);
  const [pendingCoords,   setPendingCoords]   = useState<[number, number] | null>(null);
  const [pendingSiteName, setPendingSiteName] = useState("");
  const [pendingSiteDesc, setPendingSiteDesc] = useState("");
  const [pendingSampleType, setPendingSampleType] = useState<PlannedSite["sampleType"]>("rock");

  // Keep refs in sync
  useEffect(() => { overlayLayerRef.current = overlayLayer; setGeoInfo(null); }, [overlayLayer]);

  // Sync custom layers from localStorage
  useEffect(() => {
    const handler = () => setCustomLayers(loadCustomLayers());
    window.addEventListener("custom-layers-updated", handler);
    return () => window.removeEventListener("custom-layers-updated", handler);
  }, []);

  // Sync custom layers ref + update map when list changes
  useEffect(() => {
    customLayersRef.current = customLayers;
    if (!mapInstanceRef.current || !mapLoadedRef.current) return;
    const map = mapInstanceRef.current;
    const existingIds = new Set<string>(
      (map.getStyle()?.layers ?? [])
        .filter((l: any) => l.id.startsWith("clayer_fill_"))
        .map((l: any) => (l.id as string).replace("clayer_fill_", ""))
    );
    const newIds = new Set<string>(customLayers.map((l) => l.id));
    existingIds.forEach((id) => { if (!newIds.has(id)) safeRemoveCustomLayer(map, id); });
    customLayers.forEach((layer) => { if (!existingIds.has(layer.id)) safeAddCustomLayer(map, layer); });
  }, [customLayers]);
  useEffect(() => {
    pinModeRef.current = pinMode;
    // Update map cursor when mode changes
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.getCanvas().style.cursor = pinMode ? "crosshair" : "default"; } catch {}
    }
  }, [pinMode]);

  // Create a new trip when navigating to /trip/new
  useEffect(() => {
    if (tripId === "new") {
      const tripIdValue = `trip_${Date.now()}`;
      const dataset = createTripDataset({
        tripId: tripIdValue,
        name: "New Trip",
        description: "Planned sample sites from Trip Planner",
      });
      const newTrip: Trip = {
        id: tripIdValue,
        name: "New Trip",
        notes: "",
        sites: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        datasetId: dataset.id,
      };
      const updated = [...loadTrips(), newTrip];
      saveTrips(updated);
      setTrips(updated);
      setLocation(`/trip/${newTrip.id}`, { replace: true });
    }
  }, [tripId]);

  const activeTrip = tripId && tripId !== "new" ? trips.find((t) => t.id === tripId) : null;

  const ensureTripDataset = (trip: Trip): { trip: Trip; datasetId: number } => {
    const dataset = createTripDataset({
      tripId: trip.id,
      name: trip.name || "New Trip",
      description: "Planned sample sites from Trip Planner",
    });

    if (dataset.name !== trip.name && trip.name.trim()) {
      updateLocalDataset(dataset.id, {
        name: trip.name,
        description: dataset.description || "Planned sample sites from Trip Planner",
      });
    }

    return { trip: { ...trip, datasetId: dataset.id }, datasetId: dataset.id };
  };

  const upsertPlannedSiteSample = (trip: Trip, site: PlannedSite, datasetId: number, siteIndex: number): PlannedSite => {
    const queue = getQueue();
    const queuedId = site.queuedSampleId || `q_site_${site.id}`;
    const payload: QueuedSample["payload"] = {
      sampleType: site.sampleType ?? "other",
      sampleId: siteSampleId(site.name, siteIndex),
      folderId: datasetId,
      notes: site.description || "Planned future sample site",
      fields: {
        location: `${formatCoord(site.lat)}, ${formatCoord(site.lng)}`,
        otherSampleTitle: plannedSiteTitle(site),
        collectionStatus: "planned",
        plannedSiteId: site.id,
        tripId: trip.id,
        tripName: trip.name,
      },
    };
    const item: QueuedSample = {
      queuedId,
      queuedAt: site.addedAt,
      payload,
    };
    const existingIndex = queue.findIndex((q) => q.queuedId === queuedId || q.payload.fields?.plannedSiteId === site.id);
    const nextQueue = [...queue];
    if (existingIndex >= 0) nextQueue[existingIndex] = { ...nextQueue[existingIndex], ...item };
    else nextQueue.push(item);
    setQueue(nextQueue);
    return { ...site, queuedSampleId: queuedId };
  };

  const removePlannedSiteSample = (site: PlannedSite) => {
    setQueue(
      getQueue().filter((item) =>
        item.queuedId !== site.queuedSampleId && item.payload.fields?.plannedSiteId !== site.id
      )
    );
  };

  const updateTrip = (updates: Partial<Trip>) => {
    const updated = trips.map((t) => {
      if (t.id !== activeTrip?.id) return t;
      const nextTrip = { ...t, ...updates, updatedAt: new Date().toISOString() };
      if (nextTrip.datasetId) {
        updateLocalDataset(nextTrip.datasetId, {
          name: nextTrip.name,
          description: "Planned sample sites from Trip Planner",
        });
        nextTrip.sites = nextTrip.sites.map((site, index) =>
          upsertPlannedSiteSample(nextTrip, site, nextTrip.datasetId!, index)
        );
      }
      return nextTrip;
    });
    saveTrips(updated);
    setTrips(updated);
  };

  const handleSave = () => {
    if (!activeTrip) return;
    updateTrip({});
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  };

  const deleteTrip = () => {
    if (!activeTrip) return;
    if (!confirm(`Delete "${activeTrip.name}"? This cannot be undone.`)) return;
    activeTrip.sites.forEach(removePlannedSiteSample);
    if (activeTrip.datasetId) deleteLocalDataset(activeTrip.datasetId);
    const updated = trips.filter((t) => t.id !== activeTrip.id);
    saveTrips(updated);
    setTrips(updated);
    setLocation(updated.length > 0 ? `/trip/${updated[updated.length - 1].id}` : "/");
  };

  const addSite = (site: Omit<PlannedSite, "id" | "addedAt">) => {
    if (!activeTrip) return;
    const { trip, datasetId } = ensureTripDataset(activeTrip);
    const siteIndex = trip.sites.length;
    const newSiteBase: PlannedSite = { ...site, id: `site_${Date.now()}`, addedAt: new Date().toISOString() };
    const newSite = upsertPlannedSiteSample(trip, newSiteBase, datasetId, siteIndex);
    const updatedTrip = { ...trip, sites: [...trip.sites, newSite], updatedAt: new Date().toISOString() };
    const updated = trips.map((t) => t.id === updatedTrip.id ? updatedTrip : t);
    saveTrips(updated);
    setTrips(updated);
    return newSite;
  };

  const removeSite = (id: string) => {
    if (!activeTrip) return;
    const site = activeTrip.sites.find((s) => s.id === id);
    if (site) removePlannedSiteSample(site);
    updateTrip({ sites: activeTrip.sites.filter((s) => s.id !== id) });
  };

  // ── Map lifecycle: init when mapOpen=true, destroy when false ─────────────
  useEffect(() => {
    if (!mapOpen) {
      mapMarkersRef.current.forEach((m) => { try { m.remove(); } catch {} });
      mapMarkersRef.current = [];
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
      mapLoadedRef.current = false;
      setPendingCoords(null);
      setPinMode(false);
      setGeoInfo(null);
      return;
    }

    let cancelled = false;

    // Wait two animation frames so the modal has fully painted and has real pixel dimensions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

        import("maplibre-gl").then((L) => {
          if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

          const map = new L.Map({
            container: mapContainerRef.current!,
            style: TRIP_MAP_STYLE,
            center: [-98.35, 39.5],
            zoom: 4,
            pitch: 40,
            maxPitch: 85,
          });
          mapInstanceRef.current = map;

          map.addControl(new L.NavigationControl({ visualizePitch: true }), "top-right");
          map.addControl(new L.ScaleControl(), "bottom-left");
          map.getCanvas().style.cursor = "default";

          map.on("load", () => {
            if (cancelled) return;
            mapLoadedRef.current = true;

            // Apply base layer state that may have been set before map loaded
            try {
              map.setLayoutProperty("satellite-layer", "visibility", baseLayer === "satellite" ? "visible" : "none");
              map.setLayoutProperty("street-layer",    "visibility", baseLayer === "street"    ? "visible" : "none");
              map.setLayoutProperty("labels",          "visibility", baseLayer === "satellite" ? "visible" : "none");
            } catch {}

            // Apply terrain state
            if (!terrain) {
              try { map.setTerrain(null); map.setPitch(0); } catch {}
            }

            // Apply overlay
            if (overlayLayerRef.current !== "none") {
              safeAddOverlay(map, overlayLayerRef.current);
            }

            // Add any saved custom layers
            customLayersRef.current.forEach((layer) => safeAddCustomLayer(map, layer));

            // Place existing site markers
            const sitesSnapshot = activeTrip?.sites ?? [];
            sitesSnapshot.forEach((s) => addSiteMarker(L, map, s));
          });

          // Click: pin mode → place site; otherwise → query overlay info
          map.on("click", async (e: any) => {
            if (cancelled) return;
            const { lng, lat } = e.lngLat;

            if (pinModeRef.current) {
              // Place a sample site
              setPendingCoords([lat, lng]);
              setPendingSiteName("");
              setPendingSiteDesc("");
              setPendingSampleType("rock");
              setPinMode(false);
              map.getCanvas().style.cursor = "default";
              return;
            }

            // Query overlay info (mirrors map-view click handler)
            const over = overlayLayerRef.current;
            if (over === "none" || over === "trails") return;
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
                    loading: false, lngLat: [lng, lat],
                    data: {
                      Formation: unit.strat_name_long || unit.map_unit_name || "Unknown",
                      Age:       [unit.t_int_name, unit.b_int_name].filter(Boolean).join(" – ") || "—",
                      Era:       unit.era || "—",
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
      });
    });

    return () => { cancelled = true; };
  }, [mapOpen]);

  // ── Base layer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoadedRef.current) return;
    try {
      mapInstanceRef.current.setLayoutProperty("satellite-layer", "visibility", baseLayer === "satellite" ? "visible" : "none");
      mapInstanceRef.current.setLayoutProperty("street-layer",    "visibility", baseLayer === "street"    ? "visible" : "none");
      // Esri reference labels only make sense over satellite; OSM street tiles include their own labels
      mapInstanceRef.current.setLayoutProperty("labels",          "visibility", baseLayer === "satellite" ? "visible" : "none");
    } catch {}
  }, [baseLayer]);

  // ── Terrain ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoadedRef.current) return;
    try {
      if (terrain) {
        mapInstanceRef.current.setTerrain({ source: "terrain", exaggeration: 1.5 });
        mapInstanceRef.current.setMaxPitch(85);
      } else {
        mapInstanceRef.current.setTerrain(null);
        mapInstanceRef.current.setMaxPitch(60);
        mapInstanceRef.current.setPitch(0);
      }
    } catch {}
  }, [terrain]);

  // ── Overlay ────────────────────────────────────────────────────────────────
  useEffect(() => {
    overlayLayerRef.current = overlayLayer;
    if (!mapInstanceRef.current || !mapLoadedRef.current) return;
    safeRemoveOverlays(mapInstanceRef.current);
    if (overlayLayer !== "none") safeAddOverlay(mapInstanceRef.current, overlayLayer);
  }, [overlayLayer]);

  // ── Site marker helper ─────────────────────────────────────────────────────
  function addSiteMarker(L: any, map: any, site: { name: string; lat: number; lng: number; description?: string }) {
    const el = document.createElement("div");
    el.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#155e4e;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:15px;cursor:pointer;";
    el.textContent = "⭐";

    const popup = new L.Popup({ closeButton: false, offset: [0, -18] }).setHTML(
      `<div style="font-family:system-ui,sans-serif;"><strong>${site.name}</strong>${
        site.description ? `<br/><span style="font-size:12px;color:#555;">${site.description}</span>` : ""
      }<br/><span style="font-size:11px;color:#888;">${formatCoord(site.lat)}, ${formatCoord(site.lng)}</span></div>`
    );

    const marker = new L.Marker({ element: el, anchor: "center" }).setLngLat([site.lng, site.lat]).addTo(map);
    el.addEventListener("mouseenter", () => popup.setLngLat([site.lng, site.lat]).addTo(map));
    el.addEventListener("mouseleave", () => { try { popup.remove(); } catch {} });
    mapMarkersRef.current.push(marker);
  }

  const handleConfirmSite = () => {
    if (!pendingCoords || !pendingSiteName.trim()) return;
    const newSite = addSite({
      name: pendingSiteName.trim(),
      description: pendingSiteDesc.trim(),
      sampleType: pendingSampleType,
      lat: pendingCoords[0],
      lng: pendingCoords[1],
    });
    if (mapInstanceRef.current && newSite) {
      import("maplibre-gl").then((L) => {
        if (mapInstanceRef.current && newSite) addSiteMarker(L, mapInstanceRef.current, newSite);
      });
    }
    setPendingCoords(null);
    setPendingSiteName("");
    setPendingSiteDesc("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!activeTrip && tripId !== "new") {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-80 text-center">
          <Bookmark className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No trip selected</h2>
          <p className="text-muted-foreground mt-2">Create a new trip from the sidebar.</p>
          <Button className="mt-6 gap-2" onClick={() => setLocation("/trip/new")}>
            <Plus className="w-4 h-4" /> New Trip
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold font-display flex items-center gap-3 mb-1">
              <Bookmark className="text-primary w-8 h-8 shrink-0" />
              <span className="truncate">{activeTrip?.name || "Loading..."}</span>
            </h1>
            <p className="text-muted-foreground text-sm">
              {activeTrip?.sites.length ?? 0} planned site{(activeTrip?.sites.length ?? 0) !== 1 ? "s" : ""}
              {activeTrip?.updatedAt && ` · Saved ${new Date(activeTrip.updatedAt).toLocaleDateString()}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/20 hover:bg-destructive/10"
              onClick={deleteTrip}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleSave} variant={saveFlash ? "default" : "outline"} className="gap-2">
              <Save className="w-4 h-4" />
              {saveFlash ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>

        {/* Trip name */}
        <div className="space-y-2 mb-6">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trip Name</Label>
          <Input
            value={activeTrip?.name ?? ""}
            onChange={(e) => updateTrip({ name: e.target.value })}
            placeholder="e.g. Summer 2024 Granite Belt Survey"
            className="text-lg font-medium h-12"
          />
        </div>

        {/* Notes */}
        <div className="space-y-2 mb-8">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Edit3 className="w-3.5 h-3.5" />
            Field Notes &amp; Plans
          </Label>
          <Textarea
            value={activeTrip?.notes ?? ""}
            onChange={(e) => updateTrip({ notes: e.target.value })}
            placeholder={`Write your field plan here...\n\nObjectives, equipment checklist, safety notes, target formations, permits needed, weather windows, team assignments...`}
            className="min-h-64 text-sm leading-relaxed resize-y"
          />
        </div>

        {/* Sample Sites */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold font-display flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Planned Sample Sites
              {(activeTrip?.sites.length ?? 0) > 0 && (
                <span className="text-sm font-normal text-muted-foreground">({activeTrip?.sites.length})</span>
              )}
            </h2>
            <Button onClick={() => setMapOpen(true)} className="gap-2">
              <Map className="w-4 h-4" />
              Add Sample Sites
            </Button>
          </div>

          {(activeTrip?.sites.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-2xl text-center">
              <MapPin className="w-10 h-10 text-muted-foreground mb-3" />
              <h3 className="font-semibold">No sites planned yet</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Click "Add Sample Sites" to pin future collection spots on the map.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTrip?.sites.map((site, idx) => (
                <div key={site.id} className="flex items-start gap-4 p-4 bg-card rounded-xl border border-border shadow-sm">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold font-display text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{site.name}</p>
                      <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {plannedSiteSampleTypeLabel(site)}
                      </span>
                    </div>
                    {site.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{site.description}</p>
                    )}
                    <p className="text-xs font-mono text-muted-foreground mt-1.5">
                      📍 {formatCoord(site.lat)}, {formatCoord(site.lng)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeSite(site.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Map Modal ──────────────────────────────────────────────────────── */}
      {mapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="bg-card rounded-3xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden"
            style={{ height: MAP_MODAL_HEIGHT }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="font-display font-bold text-xl flex items-center gap-2">
                  <Map className="w-5 h-5 text-primary" />
                  Trip Planning Map
                </h2>
                <p className="text-sm text-muted-foreground">
                  Explore overlays by clicking · use "Add Sample Spot" to pin a site
                </p>
              </div>
              <div className="flex items-center gap-3">
                {(activeTrip?.sites.length ?? 0) > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {activeTrip?.sites.length} site{(activeTrip?.sites.length ?? 0) !== 1 ? "s" : ""} planned
                  </span>
                )}
                <Button onClick={() => setMapOpen(false)}>Done</Button>
              </div>
            </div>

            {/* ── Map controls bar (mirrors map-view controls) ── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-muted/30">
              {/* Base layer toggle */}
              <div className="flex items-center gap-0.5 bg-card border border-border rounded-lg p-1 shadow-sm">
                {(["satellite", "street"] as const).map((bl) => (
                  <button
                    key={bl}
                    onClick={() => setBaseLayer(bl)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${baseLayer === bl ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {bl === "satellite" ? <Satellite className="w-3.5 h-3.5" /> : <Map className="w-3.5 h-3.5" />}
                    {bl.charAt(0).toUpperCase() + bl.slice(1)}
                  </button>
                ))}
              </div>

              {/* 3D Terrain toggle */}
              <button
                onClick={() => setTerrain((t) => !t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-sm ${terrain ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                <Mountain className="w-3.5 h-3.5" />
                3D Terrain
              </button>

              {/* Overlay dropdown */}
              <div className="relative">
                <select
                  className="flex items-center pl-8 pr-4 h-9 rounded-lg border border-border bg-card text-sm font-medium shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                  value={overlayLayer}
                  onChange={(e) => setOverlayLayer(e.target.value as OverlayLayer)}
                >
                  <option value="none">No Overlay</option>
                  <option value="geology">Regional Geology</option>
                  <option value="soil">Soil Types</option>
                  <option value="trails">Hiking Trails (Waymarked)</option>
                </select>
                <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* Custom layer chips */}
              {customLayers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customLayers.map((layer) => (
                    <div
                      key={layer.id}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium"
                      style={{ borderColor: layer.color + "99", backgroundColor: layer.color + "18" }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                      <span className="max-w-[100px] truncate">{layer.name}</span>
                      <button
                        onClick={() => {
                          if (!confirm(`Remove "${layer.name}" layer?`)) return;
                          deleteCustomLayer(layer.id);
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Sample Spot button — arms pin mode */}
              <button
                onClick={() => { setPinMode((p) => !p); setGeoInfo(null); setPendingCoords(null); }}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-sm ${
                  pinMode
                    ? "bg-primary text-primary-foreground border-primary animate-pulse"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                {pinMode ? "Click map to place…" : "Add Sample Spot"}
              </button>
            </div>

            {/* Map container */}
            <div className="relative flex-1 overflow-hidden">
              {/* Hint banner */}
              {!pendingCoords && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-card/95 backdrop-blur border border-border rounded-xl px-4 py-2.5 shadow-lg text-sm flex items-center gap-2 pointer-events-none whitespace-nowrap">
                  {pinMode ? (
                    <>
                      <MapPin className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                      Click the map to place a sample site
                    </>
                  ) : overlayLayer !== "none" && overlayLayer !== "trails" ? (
                    <>
                      <Layers className="w-4 h-4 text-primary shrink-0" />
                      Click the map to query {overlayLayer === "geology" ? "rock formation" : "soil"} data
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4 text-primary shrink-0" />
                      Use "Add Sample Spot" to pin a site on the map
                    </>
                  )}
                </div>
              )}

              {/* Geo info panel */}
              {geoInfo && !pendingCoords && (
                <div className="absolute top-4 left-4 z-10 w-64 bg-card border border-border rounded-2xl shadow-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      {overlayLayer === "geology" ? "Rock Formation" : "Soil Data"}
                    </h3>
                    <button onClick={() => setGeoInfo(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
                  </div>
                  {geoInfo.lngLat && (
                    <p className="text-xs text-muted-foreground">📍 {formatCoord(geoInfo.lngLat[1])}, {formatCoord(geoInfo.lngLat[0])}</p>
                  )}
                  {geoInfo.loading && (
                    <div className="space-y-1.5">{[1,2,3].map((i) => <div key={i} className="h-3.5 bg-muted animate-pulse rounded" />)}</div>
                  )}
                  {geoInfo.error && <p className="text-xs text-destructive">{geoInfo.error}</p>}
                  {geoInfo.data && !geoInfo.loading && (
                    <div className="space-y-2">
                      {Object.entries(geoInfo.data).map(([k, v]) => (
                        <div key={k}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{k}</p>
                          <p className="text-xs text-foreground mt-0.5">{v || "—"}</p>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground pt-1.5 border-t border-border">
                        {overlayLayer === "geology" ? "Source: Macrostrat" : "Source: USDA SSURGO"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Site form popup */}
              {pendingCoords && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-card border border-border rounded-2xl shadow-xl p-5 w-80">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold font-display flex items-center gap-2 text-base">
                      <MapPin className="w-4 h-4 text-primary" />
                      New Sample Site
                    </h3>
                    <button onClick={() => setPendingCoords(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 font-mono bg-muted/50 rounded px-2 py-1">
                    {formatCoord(pendingCoords[0])}, {formatCoord(pendingCoords[1])}
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Site Name *</Label>
                      <Input
                        autoFocus
                        value={pendingSiteName}
                        onChange={(e) => setPendingSiteName(e.target.value)}
                        placeholder="e.g. River Outcrop A"
                        onKeyDown={(e) => e.key === "Enter" && handleConfirmSite()}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Sample Type</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                        value={pendingSampleType}
                        onChange={(e) => setPendingSampleType(e.target.value as PlannedSite["sampleType"])}
                      >
                        <option value="rock">Rock</option>
                        <option value="water">Water</option>
                        <option value="soil_sand">Soil / Sediment</option>
                        <option value="air">Air</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Description (Optional)</Label>
                      <Textarea
                        value={pendingSiteDesc}
                        onChange={(e) => setPendingSiteDesc(e.target.value)}
                        placeholder="Target lithology, access notes..."
                        className="h-20 resize-none text-sm"
                      />
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={handleConfirmSite}
                      disabled={!pendingSiteName.trim()}
                    >
                      <Plus className="w-4 h-4" />
                      Add Sample Site
                    </Button>
                  </div>
                </div>
              )}

              {/* THE MAP */}
              <div
                ref={mapContainerRef}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
