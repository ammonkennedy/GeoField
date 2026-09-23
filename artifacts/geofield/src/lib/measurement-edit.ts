import type { StrikeDipMeasurement } from './strike-dip-measurements.ts';

export function validMeasurementAngle(value: string, maximum: number, exclusive = false): number | null {
  if (!value.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && (exclusive ? number < maximum : number <= maximum) ? number : null;
}

/** Apply only edited fields to the latest record, preserving in-flight GPS/photo/sync updates. */
export function applyMeasurementEdit(current: StrikeDipMeasurement, patch: Partial<StrikeDipMeasurement>): StrikeDipMeasurement {
  const next = { ...current, ...patch, id: current.id };
  if ('strike' in patch) {
    const strike = validMeasurementAngle(next.strike, 360, true);
    if (strike === null) throw new Error('Strike must be between 0° and less than 360°.');
    next.strikeDegrees = strike;
    next.dipDirectionDegrees = (strike + 90) % 360;
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    next.dipDir = `${next.dipDirectionDegrees}° ${directions[Math.round(next.dipDirectionDegrees / 22.5) % 16]}`;
  }
  if ('dip' in patch) {
    const dip = validMeasurementAngle(next.dip, 90);
    if (dip === null) throw new Error('Dip must be between 0° and 90°.');
    next.dipDegrees = dip;
  }
  if ('trendDegrees' in patch || 'plungeDegrees' in patch) {
    const trend = validMeasurementAngle(String(next.trendDegrees ?? ''), 360, true);
    const plunge = validMeasurementAngle(String(next.plungeDegrees ?? ''), 90);
    if (trend === null || plunge === null) throw new Error('Enter a valid azimuth and plunge.');
    const azimuth = trend * Math.PI / 180, slope = plunge * Math.PI / 180;
    next.lineVector = { east: Math.cos(slope) * Math.sin(azimuth), north: Math.cos(slope) * Math.cos(azimuth), up: -Math.sin(slope) };
  }
  if (["strike", "dip", "trendDegrees", "plungeDegrees"].some(key => key in patch)) next.quality = "manual";
  return next;
}
