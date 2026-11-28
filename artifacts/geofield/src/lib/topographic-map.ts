/** Thunderforest is used only for interactive online viewing. No downloader,
 * proxy, payment API or automatic plan upgrade is involved.
 * Configure a key belonging to the free Hobby Project plan only.
 */
export function topographicMapConfig(apiKey = '') {
  const key = apiKey.trim();
  return key ? {
    label: 'World Topo', onlineOnly: true, cameraMaxZoom: 18,
    source: {
      type: 'raster' as const,
      tiles: [`https://api.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=${encodeURIComponent(key)}`],
      tileSize: 256, maxzoom: 19,
      attribution: 'Maps © <a href="https://www.thunderforest.com/" target="_blank" rel="noopener noreferrer">Thunderforest</a>, Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    },
  } : {
    label: 'USGS Topo', onlineOnly: false, cameraMaxZoom: 15,
    source: {
      type: 'raster' as const,
      tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, maxzoom: 16, attribution: 'USGS The National Map',
    },
  };
}
const environment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
export const TOPOGRAPHIC_MAP = topographicMapConfig(environment?.VITE_THUNDERFOREST_API_KEY);
