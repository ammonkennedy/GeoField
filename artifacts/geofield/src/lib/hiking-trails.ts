const API = 'https://hiking.waymarkedtrails.org/api/v1';
export interface HikingTrail { id: number; name: string; distance: string; }

export function trailDistance(detail: { official_length?: unknown; mapped_length?: unknown; route?: { length?: unknown } }): string {
  const length = [detail.official_length, detail.route?.length, detail.mapped_length]
    .find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (typeof length !== 'number') return 'Distance unavailable';
  return `${(length / 1000).toFixed(1)} km (${(length / 1609.344).toFixed(1)} mi)`;
}

/** Waymarked Trails expects EPSG:3857 metres, not longitude/latitude degrees. */
export function trailApiBounds(bbox: number[]): number[] {
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) throw new Error("Invalid trail lookup bounds");
  const project = (lng: number, lat: number) => {
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
    return [6378137 * lng * Math.PI / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
  };
  return [...project(bbox[0], bbox[1]), ...project(bbox[2], bbox[3])];
}

export async function lookupHikingTrails(bbox: number[], signal: AbortSignal): Promise<HikingTrail[]> {
  const read = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Trail service returned ${response.status}`);
    return response.json();
  };
  const listing = await read(`${API}/list/by_area?${new URLSearchParams({ bbox: trailApiBounds(bbox).join(','), limit: '3' })}`);
  const routes = (listing.results ?? []).filter((route: any) => route.type === 'relation' && Number.isSafeInteger(route.id) && route.id > 0).slice(0, 3);
  return Promise.all(routes.map(async (route: any) => {
    const name = route.name || route.ref || 'Unnamed hiking route';
    try {
      const detail = await read(`${API}/details/relation/${route.id}`);
      return { id: route.id, name: detail.name || name, distance: trailDistance(detail) };
    } catch (error) {
      if (signal.aborted) throw error;
      return { id: route.id, name, distance: 'Distance temporarily unavailable' };
    }
  }));
}
