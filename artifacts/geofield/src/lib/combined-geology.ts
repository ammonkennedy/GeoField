import { queryMacrostratGeology, enrichMacrostratSelection } from './macrostrat-service.ts';
import type { MacrostratSelection } from './macrostrat-types.ts';

export const USGS_GEOLOGY_URL = 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/National_Earth_Surface_v2/FeatureServer';
type Row = Record<string, unknown>;
export interface UsgsUnit { code: string; original?: Row; synthesis?: Row; sources: Row[] }
export interface CombinedGeology { macrostrat: MacrostratSelection | null; usgs: UsgsUnit[]; warnings: string[] }
export const geologyText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function query(layer: number, params: Record<string, string>, signal: AbortSignal): Promise<Row[]> {
  const url = `${USGS_GEOLOGY_URL}/${layer}/query?${new URLSearchParams({ f: 'json', outFields: '*', returnGeometry: 'false', ...params })}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('USGS unavailable');
  const data = await response.json();
  if (data.error || !Array.isArray(data.features) || data.exceededTransferLimit) throw new Error('USGS incomplete response');
  return data.features.map((feature: { attributes: Row }) => feature.attributes);
}

export async function queryUsgsGeology(latitude: number, longitude: number, signal: AbortSignal): Promise<UsgsUnit[]> {
  const polygons = await query(6, { geometry: `${longitude},${latitude}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }, signal);
  // Boundary points may intersect multiple units. Keep each distinct source unit.
  const unique = [...new Map(polygons.map(row => [`${row.MapUnit}:${row.Source_MapUnit}`, row])).values()];
  return Promise.all(unique.map(async polygon => {
    const code = geologyText(polygon.MapUnit);
    const sourceCode = geologyText(polygon.Source_MapUnit);
    const [original, synthesis] = await Promise.all([
      sourceCode ? query(11, { where: `Source_MapUnit=${literal(sourceCode)}` }, signal) : [],
      code ? query(8, { where: `MapUnit=${literal(code)}` }, signal) : [],
    ]);
    const ids = [...new Set([polygon.DataSourceID, ...original.map(row => row.DescriptionSourceID), ...synthesis.map(row => row.DescriptionSourceID)].map(geologyText).filter(Boolean))];
    const sources = ids.length ? await query(7, { where: `DataSources_ID IN (${ids.map(literal).join(',')})` }, signal) : [];
    return { code, original: original[0], synthesis: synthesis[0], sources };
  }));
}

export async function queryCombinedGeology(latitude: number, longitude: number, signal?: AbortSignal, renderedSelection?: MacrostratSelection | null): Promise<CombinedGeology> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const [macrostrat, usgs] = await Promise.allSettled([
      renderedSelection === undefined
        ? queryMacrostratGeology(latitude, longitude, controller.signal)
        : enrichMacrostratSelection(renderedSelection, controller.signal),
      queryUsgsGeology(latitude, longitude, controller.signal),
    ]);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return {
      macrostrat: macrostrat.status === 'fulfilled' ? macrostrat.value : renderedSelection ?? null,
      usgs: usgs.status === 'fulfilled' ? usgs.value : [],
      warnings: [macrostrat.status === 'rejected' ? 'Macrostrat is temporarily unavailable. Tap the map to retry.' : '', usgs.status === 'rejected' ? 'USGS is temporarily unavailable. Tap the map to retry.' : ''].filter(Boolean),
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
