import { figureNumber } from './sample-figures.ts';

export function histogram(values: number[], count: number) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  const min = Math.min(...finite), max = Math.max(...finite);
  const bins = min === max ? 1 : Math.max(1, Math.min(50, Math.round(count) || 1));
  const width = min === max ? 1 : (max - min) / bins;
  const result = Array.from({ length: bins }, (_, i) => ({
    lower: min + i * width, upper: min === max ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const value of finite) result[Math.min(bins - 1, Math.floor((value - min) / width))].count++;
  return result;
}

/** Pearson correlation, pairwise complete readings; undefined for constant or insufficient data. */
export function correlation(records: Record<string, unknown>[], xKey: string, yKey: string) {
  const pairs = records.flatMap(record => {
    const x = figureNumber(record[xKey]), y = figureNumber(record[yKey]);
    return x === undefined || y === undefined ? [] : [[x, y]];
  });
  const n = pairs.length;
  if (n < 3) return { n, r: null };
  const scaleX = Math.max(...pairs.map(([x]) => Math.abs(x))) || 1;
  const scaleY = Math.max(...pairs.map(([, y]) => Math.abs(y))) || 1;
  const normalized = pairs.map(([x, y]) => [x / scaleX, y / scaleY]);
  const meanX = normalized.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = normalized.reduce((sum, [, y]) => sum + y, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of normalized) {
    xx += (x - meanX) ** 2; yy += (y - meanY) ** 2; xy += (x - meanX) * (y - meanY);
  }
  const r = xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : NaN;
  return { n, r: Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null };
}

/** Retain missing Y values as gaps; never connect through missing readings. */
export function linePoints(records: { name: string; values: Record<string, unknown> }[], yKey: string, xKey: string) {
  return records.flatMap((record, index) => {
    const x = xKey ? figureNumber(record.values[xKey]) : index + 1;
    return x === undefined ? [] : [{ name: record.name, x, value: figureNumber(record.values[yKey]) ?? null }];
  }).sort((a, b) => a.x - b.x);
}
