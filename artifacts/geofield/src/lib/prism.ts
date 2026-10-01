export const PRISM_VARIABLES = ["ppt", "tmean", "tmin", "tmax"] as const;
export type PrismVariable = typeof PRISM_VARIABLES[number];
export interface PrismGrid { width: number; height: number; west: number; north: number; step: number }
export interface PrismData {
  grid: PrismGrid;
  accessed: string;
  values: Record<PrismVariable, Float32Array>;
}
export const PRISM_LABELS: Record<PrismVariable, string> = {
  ppt: "Annual precipitation", tmean: "Annual mean temperature",
  tmin: "Annual average daily minimum", tmax: "Annual average daily maximum",
};
export function prismIndex(grid: PrismGrid, lng: number, lat: number): number | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const col = Math.floor((lng - grid.west) / grid.step);
  const row = Math.floor((grid.north - lat) / grid.step);
  return col < 0 || row < 0 || col >= grid.width || row >= grid.height ? null : row * grid.width + col;
}
export function prismValue(data: PrismData, variable: PrismVariable, index: number | null): number | null {
  if (index === null) return null;
  const value = data.values[variable][index];
  return Number.isFinite(value) && value !== -9999 ? value : null;
}
export function prismBounds(grid: PrismGrid): [number, number, number, number] {
  return [grid.west, grid.north - grid.height * grid.step, grid.west + grid.width * grid.step, grid.north];
}
/** Include intersecting original cells, preserving their exact grid boundaries. */
export function cropPrism(data: PrismData, bounds: [number, number, number, number]): PrismData {
  const g = data.grid;
  const [west, south, east, north] = bounds;
  if (!bounds.every(Number.isFinite) || east <= west || north <= south) throw new Error("Choose a region within the contiguous United States.");
  const left = Math.max(0, Math.floor((west - g.west) / g.step));
  const right = Math.min(g.width, Math.ceil((east - g.west) / g.step));
  const top = Math.max(0, Math.floor((g.north - north) / g.step));
  const bottom = Math.min(g.height, Math.ceil((g.north - south) / g.step));
  const width = right - left, height = bottom - top;
  if (width <= 0 || height <= 0) throw new Error("This view is outside PRISM's contiguous U.S. coverage.");
  if (width * height > 100000) throw new Error("Zoom in to a smaller region before downloading or exporting (maximum 100,000 cells).");
  const values = {} as PrismData['values'];
  for (const variable of PRISM_VARIABLES) {
    const result = new Float32Array(width * height);
    for (let row = 0; row < height; row++) result.set(data.values[variable].subarray((top + row) * g.width + left, (top + row) * g.width + right), row * width);
    values[variable] = result;
  }
  if (!values.ppt.some(v => v !== -9999 && Number.isFinite(v))) throw new Error("No PRISM land cells in this view.");
  return { accessed: data.accessed, grid: { width, height, west: g.west + left * g.step, north: g.north - top * g.step, step: g.step }, values };
}
export function prismCsv(data: PrismData): string {
  const rows = ['longitude,latitude,annual_precipitation_mm,annual_mean_temperature_C,annual_average_daily_minimum_C,annual_average_daily_maximum_C,period,resolution,source,source_url,accessed'];
  for (let i = 0; i < data.grid.width * data.grid.height; i++) {
    const values = PRISM_VARIABLES.map(v => prismValue(data, v, i));
    if (values.every(v => v === null)) continue;
    rows.push([ (data.grid.west + (i % data.grid.width + 0.5) * data.grid.step).toFixed(7),
      (data.grid.north - (Math.floor(i / data.grid.width) + 0.5) * data.grid.step).toFixed(7),
      ...values.map(v => v === null ? '' : v.toFixed(2)), '1991-2020', '4 km',
      '"PRISM Group, Oregon State University"', 'https://prism.oregonstate.edu', data.accessed ].join(','));
  }
  return rows.join('\r\n');
}
