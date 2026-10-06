import type { StrikeDipMeasurement } from './strike-dip-measurements';

function angle(value: unknown, maximum: number, exclusive = false): number | undefined {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && (exclusive ? parsed < maximum : parsed <= maximum) ? parsed : undefined;
}

/** Adapt measurements for charts without turning missing angles into zero. */
export function measurementFigureRecords(measurements: StrikeDipMeasurement[]) {
  return measurements.map(item => ({
    id: `measurement:${item.id}`,
    sampleId: item.label || (item.measurementType === 'lineation' ? 'Lineation' : 'Strike & Dip'),
    sampleType: item.measurementType === 'lineation' ? 'lineation' : 'plane',
    fields: item.measurementType === 'lineation'
      ? { azimuth: angle(item.trendDegrees, 360, true), plunge: angle(item.plungeDegrees, 90) }
      : { strike: angle(item.strike, 360, true), dip: angle(item.dip, 90) },
  }));
}
