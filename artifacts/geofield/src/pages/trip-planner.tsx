import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  MapPin, Plus, Trash2, Save, Map, X, Navigation, Edit3, Bookmark,
  Layers, Satellite, Mountain, Search, Loader2, Upload, Check,
} from "lucide-react";
import * as XLSX from "xlsx";
import { loadCustomLayers, safeAddCustomLayer, safeRemoveCustomLayer, deleteCustomLayer, type CustomMapLayer } from "@/lib/custom-layers";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createTripDataset, deleteLocalDataset, updateLocalDataset } from "@/lib/local-datasets";
import { getQueue, setQueue, type QueuedSample } from "@/lib/offline-queue";
import { geocodeAddress } from "@/lib/geocoding";
import { lookupSoil } from "@/lib/soil-data";
import "maplibre-gl/dist/maplibre-gl.css";

// ── Types ──────────────────────────────────────────────────────────────────────
type BaseLayer    = "street" | "satellite";
type OverlayLayer = "none" | "geology" | "soil" | "trails";

const USGS_IMAGERY_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
const USGS_TOPO_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const GEO_TILES    = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const TRAILS_TILES = "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png";
const SOIL_WMS     =
  "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=TRUE&LAYERS=mapunitpoly&STYLES=default&WIDTH=256&HEIGHT=256&SRS=EPSG%3A3857&BBOX={bbox-epsg-3857}";

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
      map.addSource("soil", { type: "raster", tiles: [SOIL_WMS], tileSize: 256, minzoom: 4, maxzoom: 18, attribution: "USDA NRCS SSURGO via Soil Data Access" });
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
const SITE_SPREADSHEET_ACCEPT = ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

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

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRowValue(row: Record<string, any>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const found = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  const value = found?.[1];
  return value === undefined || value === null ? "" : String(value).trim();
}

function parseNumber(value: string) {
  if (!value) return NaN;
  return Number(value.replace(/[^\d.-]/g, ""));
}

function normalizeSampleType(value: string): PlannedSite["sampleType"] {
  const normalized = normalizeHeader(value);
  if (normalized.includes("water")) return "water";
  if (normalized.includes("soil") || normalized.includes("sediment") || normalized.includes("sand")) return "soil_sand";
  if (normalized.includes("air") || normalized.includes("pid") || normalized.includes("voc")) return "air";
  if (normalized.includes("other")) return "other";
  return "rock";
}

function parseSiteRows(rows: Record<string, any>[]): Omit<PlannedSite, "id" | "addedAt">[] {
  return rows.flatMap((row, index) => {
    const lat = parseNumber(getRowValue(row, ["lat", "latitude", "y", "northing latitude"]));
    const lng = parseNumber(getRowValue(row, ["lon", "lng", "long", "longitude", "x", "easting longitude"]));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];

    const name =
      getRowValue(row, ["site name", "site", "name", "sample id", "sampleid", "id", "location"]) ||
      `Imported Site ${index + 1}`;
    const description = getRowValue(row, ["description", "notes", "note", "field notes", "target", "comments"]);
    const sampleType = normalizeSampleType(getRowValue(row, ["sample type", "sampletype", "type"]));
    return [{ name, description, sampleType, lat, lng }];
  });
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
  const [terrain,      setTerrain]      = useState(false);
  const [overlayLayer, setOverlayLayer] = useState<OverlayLayer>("none");
  const [customLayers, setCustomLayers] = useState<CustomMapLayer[]>(loadCustomLayers);

  // Map refs
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapInstanceRef   = useRef<any>(null);
  const mapMarkersRef    = useRef<any[]>([]);
  const mapLoadedRef     = useRef(false);
  const overlayLayerRef  = useRef<OverlayLayer>("none");
  const terrainRef       = useRef(false);
  const pinModeRef       = useRef(false);
  const customLayersRef  = useRef<CustomMapLayer[]>(loadCustomLayers());
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);

  // Interaction state
  const [pinMode,         setPinMode]         = useState(false);
  const [geoInfo,         setGeoInfo]         = useState<{ loading: boolean; data?: Record<string, string> | null; error?: string; lngLat?: [number, number] } | null>(null);
  const [pendingCoords,   setPendingCoords]   = useState<[number, number] | null>(null);
  const [pendingSiteName, setPendingSiteName] = useState("");
  const [pendingSiteDesc, setPendingSiteDesc] = useState("");
  const [pendingSampleType, setPendingSampleType] = useState<PlannedSite["sampleType"]>("rock");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressLookupLoading, setAddressLookupLoading] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState("");
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteImportError, setSiteImportError] = useState("");
  const [siteImportNotice, setSiteImportNotice] = useState("");

  // Keep refs in sync
  useEffect(() => { overlayLayerRef.current = overlayLayer; setGeoInfo(null); }, [overlayLayer]);
  useEffect(() => { terrainRef.current = terrain; }, [terrain]);

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

  const addSites = (sites: Omit<PlannedSite, "id" | "addedAt">[]) => {
    if (!activeTrip || sites.length === 0) return [];
    const { trip, datasetId } = ensureTripDataset(activeTrip);
    const addedAt = new Date().toISOString();
    const newSites = sites.map((site, index) => {
      const siteIndex = trip.sites.length + index;
      const newSiteBase: PlannedSite = {
        ...site,
        id: `site_${Date.now()}_${index}`,
        addedAt,
      };
      return upsertPlannedSiteSample(trip, newSiteBase, datasetId, siteIndex);
    });
    const updatedTrip = { ...trip, sites: [...trip.sites, ...newSites], updatedAt: new Date().toISOString() };
    const updated = trips.map((t) => t.id === updatedTrip.id ? updatedTrip : t);
    saveTrips(updated);
    setTrips(updated);
    return newSites;
  };

  const updateSite = (siteId: string, changes: Partial<PlannedSite>) => {
    if (!activeTrip) return;
    updateTrip({
      sites: activeTrip.sites.map((site) =>
        site.id === siteId ? { ...site, ...changes } : site
      ),
    });
  };

  const removeSite = (id: string) => {
    if (!activeTrip) return;
    const site = activeTrip.sites.find((s) => s.id === id);
    if (site) removePlannedSiteSample(site);
    updateTrip({ sites: activeTrip.sites.filter((s) => s.id !== id) });
  };

  const handleSpreadsheetImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setSiteImportError("");
    setSiteImportNotice("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The spreadsheet does not contain any sheets.");
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const sites = parseSiteRows(rows);
      if (sites.length === 0) {
        throw new Error("No valid rows found. Include latitude and longitude columns.");
      }
      addSites(sites);
      setSiteImportNotice(`Imported ${sites.length} planned site${sites.length !== 1 ? "s" : ""} from ${file.name}.`);
      setTimeout(() => setSiteImportNotice(""), 5000);
    } catch (error: any) {
      setSiteImportError(error?.message || "Could not import the spreadsheet.");
    }
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
      setTerrain(false);
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
            pitch: 0,
            maxPitch: 85,
            dragRotate: true,
            pitchWithRotate: true,
            touchPitch: true,
          });
          mapInstanceRef.current = map;

          map.addControl(new L.NavigationControl({ visualizePitch: true }), "top-right");
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

            if (terrainRef.current) {
              try { map.setTerrain({ source: "terrain", exaggeration: 1.5 }); } catch {}
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
        mapInstanceRef.current.easeTo({
          pitch: Math.max(mapInstanceRef.current.getPitch(), 62),
          bearing: mapInstanceRef.current.getBearing() === 0 ? -25 : mapInstanceRef.current.getBearing(),
          duration: 900,
          essential: true,
        });
      } else {
        mapInstanceRef.current.setTerrain(null);
        mapInstanceRef.current.setMaxPitch(60);
        mapInstanceRef.current.easeTo({ pitch: 0, bearing: 0, duration: 600, essential: true });
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

  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoadedRef.current || !mapOpen) return;
    mapMarkersRef.current.forEach((marker) => { try { marker.remove(); } catch {} });
    mapMarkersRef.current = [];
    import("maplibre-gl").then((L) => {
      if (!mapInstanceRef.current || !mapLoadedRef.current) return;
      (activeTrip?.sites ?? []).forEach((site) => addSiteMarker(L, mapInstanceRef.current, site));
    });
  }, [activeTrip?.sites, mapOpen]);

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
    addSite({
      name: pendingSiteName.trim(),
      description: pendingSiteDesc.trim(),
      sampleType: pendingSampleType,
      lat: pendingCoords[0],
      lng: pendingCoords[1],
    });
    setPendingCoords(null);
    setPendingSiteName("");
    setPendingSiteDesc("");
  };

  const handleAddressSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = addressSearch.trim();
    if (!query || !mapInstanceRef.current) return;

    setAddressLookupLoading(true);
    setAddressLookupError("");
    try {
      const result = await geocodeAddress(query);
      if (!result) {
        setAddressLookupError("Address not found.");
        return;
      }
      mapInstanceRef.current.flyTo({
        center: [result.lng, result.lat],
        zoom: terrain ? 13.5 : 16,
        pitch: terrain ? 64 : 0,
        bearing: terrain ? -25 : 0,
        essential: true,
      });
      setAddressSearch("");
    } catch {
      setAddressLookupError("Address lookup failed.");
    } finally {
      setAddressLookupLoading(false);
    }
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
      <input
        ref={spreadsheetInputRef}
        type="file"
        accept={SITE_SPREADSHEET_ACCEPT}
        className="hidden"
        onChange={handleSpreadsheetImport}
      />
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
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => spreadsheetInputRef.current?.click()} className="gap-2">
                <Upload className="w-4 h-4" />
                Import Excel
              </Button>
              <Button onClick={() => setMapOpen(true)} className="gap-2">
                <Map className="w-4 h-4" />
                Add Sample Sites
              </Button>
            </div>
          </div>

          {siteImportNotice && (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <Check className="h-4 w-4" />
              {siteImportNotice}
            </div>
          )}
          {siteImportError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {siteImportError}
            </div>
          )}

          {(activeTrip?.sites.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-2xl text-center">
              <MapPin className="w-10 h-10 text-muted-foreground mb-3" />
              <h3 className="font-semibold">No sites planned yet</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Click "Add Sample Sites" to pin future collection spots, or import an Excel spreadsheet with latitude and longitude columns.
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
                    {editingSiteId === site.id ? (
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                          <div className="space-y-1">
                            <Label className="text-xs">Site Name</Label>
                            <Input value={site.name} onChange={(e) => updateSite(site.id, { name: e.target.value })} className="h-9" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Sample Type</Label>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                              value={site.sampleType ?? "other"}
                              onChange={(e) => updateSite(site.id, { sampleType: e.target.value as PlannedSite["sampleType"] })}
                            >
                              <option value="rock">Rock</option>
                              <option value="water">Water</option>
                              <option value="soil_sand">Soil / Sediment</option>
                              <option value="air">Air</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Textarea value={site.description} onChange={(e) => updateSite(site.id, { description: e.target.value })} className="min-h-16 text-sm" />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Latitude</Label>
                            <Input type="number" step="any" value={site.lat} onChange={(e) => updateSite(site.id, { lat: Number(e.target.value) })} className="h-9 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Longitude</Label>
                            <Input type="number" step="any" value={site.lng} onChange={(e) => updateSite(site.id, { lng: Number(e.target.value) })} className="h-9 font-mono" />
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="w-fit" onClick={() => setEditingSiteId(null)}>
                          Done Editing
                        </Button>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingSiteId(editingSiteId === site.id ? null : site.id)}
                    className="text-muted-foreground hover:text-primary p-1 rounded transition-colors shrink-0"
                    title="Edit site"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeSite(site.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors shrink-0"
                    title="Remove site"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4">
          <div
            className="bg-card rounded-3xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden"
            style={{ height: MAP_MODAL_HEIGHT }}
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 className="font-display font-bold text-xl flex items-center gap-2">
                  <Map className="w-5 h-5 text-primary" />
                  Trip Planning Map
                </h2>
                <p className="hidden text-sm text-muted-foreground sm:block">
                  Explore overlays by clicking · use "Add Sample Spot" to pin a site
                </p>
              </div>
              <div className="flex items-center gap-3">
                {(activeTrip?.sites.length ?? 0) > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {activeTrip?.sites.length} site{(activeTrip?.sites.length ?? 0) !== 1 ? "s" : ""} planned
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Close trip planning map"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* ── Map controls bar (mirrors map-view controls) ── */}
            <div className="grid shrink-0 grid-cols-2 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2.5 sm:flex sm:flex-wrap sm:px-4">
              {/* Base layer toggle */}
              <div className="col-span-2 flex w-full items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-sm sm:w-auto">
                {(["satellite", "street"] as const).map((bl) => (
                  <button
                    key={bl}
                    onClick={() => setBaseLayer(bl)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none ${baseLayer === bl ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {bl === "satellite" ? <Satellite className="w-3.5 h-3.5" /> : <Map className="w-3.5 h-3.5" />}
                    {bl.charAt(0).toUpperCase() + bl.slice(1)}
                  </button>
                ))}
              </div>

              <form className="relative col-span-2 min-w-0 w-full sm:min-w-[220px] sm:max-w-sm sm:flex-1" onSubmit={handleAddressSearch}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={addressSearch}
                  onChange={(e) => { setAddressSearch(e.target.value); setAddressLookupError(""); }}
                  placeholder="Search place, mountain, or address..."
                  className="h-9 pl-8 pr-9 bg-card"
                />
                <button
                  type="submit"
                  disabled={addressLookupLoading || !addressSearch.trim()}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  title="Go to address"
                >
                  {addressLookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                </button>
                {addressLookupError && (
                  <div className="absolute left-0 top-10 z-30 w-full rounded-lg border border-destructive/20 bg-card px-3 py-2 text-xs text-destructive shadow-lg">
                    {addressLookupError}
                  </div>
                )}
              </form>

              {/* 3D Terrain toggle */}
              <button
                onClick={() => setTerrain((t) => !t)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm font-medium shadow-sm transition-all sm:w-auto sm:px-3 ${terrain ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                <Mountain className="w-3.5 h-3.5" />
                {terrain ? "3D Terrain" : "2D Map"}
              </button>

              {/* Overlay dropdown */}
              <div className="relative min-w-0 w-full sm:w-auto">
                <select
                  className="flex h-9 w-full cursor-pointer appearance-none items-center rounded-lg border border-border bg-card pl-8 pr-4 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto"
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
                className={`col-span-2 flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-all sm:ml-auto sm:min-h-0 sm:w-auto sm:py-1.5 ${
                  pinMode
                    ? "bg-primary text-primary-foreground border-primary animate-pulse"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                {pinMode ? "Tap map to place…" : "Add Sample Site"}
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
              {terrain && !pendingCoords && (
                <div className="pointer-events-none absolute bottom-7 left-3 right-3 z-10 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-lg bg-black/65 px-3 py-1.5 text-center text-xs text-white shadow backdrop-blur-sm">
                  Two-finger drag tilts · twist rotates · use the right-side arrows for precise tilt
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
