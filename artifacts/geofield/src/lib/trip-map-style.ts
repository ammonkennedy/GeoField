export const TRIP_MAP_STYLE: any = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: 'Source: <a href="https://goto.arcgisonline.com/maps/World_Imagery" target="_blank" rel="noopener noreferrer">Esri World Imagery</a>, Vantor, Earthstar Geographics, and the GIS User Community',
      // Request detailed imagery instead of enlarging the old level-16 tiles.
      // Ground resolution varies by location; deeper zoom still magnifies pixels.
      maxzoom: 19,
    },
    street: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "© Esri",
      maxzoom: 19,
    },
    topographic: {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
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
    { id: "offline-background", type: "background", paint: { "background-color": "#eef2f6" } },
    { id: "satellite-layer", type: "raster", source: "satellite", layout: { visibility: "visible" } },
    { id: "street-layer",    type: "raster", source: "street",    layout: { visibility: "none"    } },
    { id: "topographic-layer", type: "raster", source: "topographic", layout: { visibility: "none" } },
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

