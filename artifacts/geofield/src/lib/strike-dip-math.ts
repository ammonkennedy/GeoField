export type Vector3 = { east: number; north: number; up: number };
export type PlaneOrientation = { dip: number; dipDirection: number | null; strike: number | null };

export const HORIZONTAL_THRESHOLD_DEGREES = 1;
export const normalizeAzimuth = (angle: number) => ((angle % 360) + 360) % 360;
const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (value: number) => value * 180 / Math.PI;

export function rotateMagneticNormalToTrue(normal: Vector3, declinationDegrees: number): Vector3 {
  const angle = radians(declinationDegrees);
  return {
    east: normal.east * Math.cos(angle) + normal.north * Math.sin(angle),
    north: -normal.east * Math.sin(angle) + normal.north * Math.cos(angle),
    up: normal.up,
  };
}

export function planeOrientationFromNormal(input: Vector3, threshold = HORIZONTAL_THRESHOLD_DEGREES): PlaneOrientation {
  const length = Math.hypot(input.east, input.north, input.up);
  if (!Number.isFinite(length) || length < 1e-9) return { dip: 0, dipDirection: null, strike: null };
  const sign = input.up < 0 ? -1 : 1;
  const normal = { east: sign * input.east / length, north: sign * input.north / length, up: sign * input.up / length };
  const dip = Math.min(90, Math.max(0, degrees(Math.atan2(Math.hypot(normal.east, normal.north), normal.up))));
  if (dip < threshold) return { dip: 0, dipDirection: null, strike: null };
  const dipDirection = normalizeAzimuth(degrees(Math.atan2(-normal.east, -normal.north)));
  return { dip, dipDirection, strike: normalizeAzimuth(dipDirection - 90) };
}

export function circularMean(values: number[]): number | null {
  if (!values.length) return null;
  const x = values.reduce((sum, value) => sum + Math.cos(radians(value)), 0);
  const y = values.reduce((sum, value) => sum + Math.sin(radians(value)), 0);
  return normalizeAzimuth(degrees(Math.atan2(y, x)));
}

export function angularDistance(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function cardinalDirection(angle: number | null): string {
  if (angle === null) return "—";
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(normalizeAzimuth(angle) / 45) % 8];
}

export function normalForDip(dip: number, dipDirection: number): Vector3 {
  const d = radians(dip);
  const azimuth = radians(dipDirection);
  return { east: -Math.sin(d) * Math.sin(azimuth), north: -Math.sin(d) * Math.cos(azimuth), up: Math.cos(d) };
}
