import { prismBounds, prismIndex, prismValue, type PrismData, type PrismVariable } from './prism';
export const PRISM_COLORS = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'];
export const TEMP_COLORS = ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026'];
export function prismColor(value: number, variable: PrismVariable): string {
  const stops = variable === 'ppt' ? [250, 500, 1000, 2000] : [0, 10, 20, 30];
  const index = stops.findIndex(stop => value < stop);
  return (variable === 'ppt' ? PRISM_COLORS : TEMP_COLORS)[index < 0 ? 4 : index];
}
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
/** Reproject the geographic grid into Mercator before using a MapLibre image source.
 * Stretching a latitude-linear image would misalign the displayed climate cells.
 */
export function prismImage(data: PrismData, variable: PrismVariable) {
  const [west, south, east, north] = prismBounds(data.grid);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(2810, data.grid.width * 2);
  canvas.height = Math.min(2484, Math.max(1, data.grid.height * 3));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot render the climate layer on this device.');
  const image = context.createImageData(canvas.width, canvas.height);
  const top = mercatorY(north), bottom = mercatorY(south);
  const palette = new Map<string, number[]>();
  for (const color of [...PRISM_COLORS, ...TEMP_COLORS]) palette.set(color, [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)));
  for (let y = 0; y < canvas.height; y++) {
    const lat = (2 * Math.atan(Math.exp(top + (bottom - top) * (y + 0.5) / canvas.height)) - Math.PI / 2) * 180 / Math.PI;
    for (let x = 0; x < canvas.width; x++) {
      const lng = west + (east - west) * (x + 0.5) / canvas.width;
      const value = prismValue(data, variable, prismIndex(data.grid, lng, lat));
      if (value === null) continue;
      const offset = (y * canvas.width + x) * 4;
      const rgb = palette.get(prismColor(value, variable))!;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return { url: canvas.toDataURL('image/png'), coordinates: [[west, north], [east, north], [east, south], [west, south]] as [[number, number], [number, number], [number, number], [number, number]] };
}
