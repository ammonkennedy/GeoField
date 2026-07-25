export type Vector3 = { east: number; north: number; up: number };
export type PlaneOrientation = { dip: number; dipDirection: number | null; strike: number | null };
export type HorizontalPlaneAxes = {
  strike: Vector3;
  downDip: Vector3;
};

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

/**
 * Project an upward-pointing plane normal into the horizontal earth plane.
 * The downhill vector is opposite that projection. The strike vector is the
 * horizontal line perpendicular to downhill, chosen to satisfy RHR:
 * strike + 90° = dip direction.
 */
export function horizontalPlaneAxesFromNormal(normal: Vector3): HorizontalPlaneAxes | null {
  const normalLength = Math.hypot(normal.east, normal.north, normal.up);
  if (!Number.isFinite(normalLength) || normalLength < 1e-9) return null;
  const sign = normal.up < 0 ? -1 : 1;
  const upward = {
    east: sign * normal.east / normalLength,
    north: sign * normal.north / normalLength,
    up: sign * normal.up / normalLength,
  };

  // The intersection of the measured plane and true horizontal is n × up.
  // This construction guarantees both dot(strike, n) = 0 and strike.up = 0.
  const strikeEast = upward.north;
  const strikeNorth = -upward.east;
  const strikeLength = Math.hypot(strikeEast, strikeNorth);
  if (strikeLength < 1e-9) return null;
  const strike = {
    east: strikeEast / strikeLength,
    north: strikeNorth / strikeLength,
    up: 0,
  };

  // The horizontal projection of -n is the direction of steepest descent.
  const downDip = {
    east: -upward.east / strikeLength,
    north: -upward.north / strikeLength,
    up: 0,
  };
  return {
    downDip,
    strike,
  };
}

export function planeOrientationFromNormal(input: Vector3, threshold = HORIZONTAL_THRESHOLD_DEGREES): PlaneOrientation {
  const length = Math.hypot(input.east, input.north, input.up);
  if (!Number.isFinite(length) || length < 1e-9) return { dip: 0, dipDirection: null, strike: null };
  const sign = input.up < 0 ? -1 : 1;
  const normal = { east: sign * input.east / length, north: sign * input.north / length, up: sign * input.up / length };
  const dip = Math.min(90, Math.max(0, degrees(Math.atan2(Math.hypot(normal.east, normal.north), normal.up))));
  if (dip < threshold) return { dip: 0, dipDirection: null, strike: null };
  const axes = horizontalPlaneAxesFromNormal(normal);
  if (!axes) return { dip: 0, dipDirection: null, strike: null };
  const dipDirection = normalizeAzimuth(degrees(Math.atan2(axes.downDip.east, axes.downDip.north)));
  const strike = normalizeAzimuth(degrees(Math.atan2(axes.strike.east, axes.strike.north)));
  return { dip, dipDirection, strike };
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
