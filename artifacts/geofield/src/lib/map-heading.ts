export function validHeading(value: unknown, accuracy?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 45))) return null;
  return value % 360;
}
export function browserHeading(event: { webkitCompassHeading?: number; webkitCompassAccuracy?: number; absolute?: boolean; alpha: number | null }, screenAngle = 0): number | null {
  const heading = event.webkitCompassHeading !== undefined
    ? validHeading(event.webkitCompassHeading, event.webkitCompassAccuracy)
    : event.absolute && event.alpha !== null ? validHeading((360 - event.alpha) % 360) : null;
  return heading === null ? null : (heading + screenAngle + 360) % 360;
}
export function relativeHeading(heading: number, mapBearing: number): number {
  return ((heading - mapBearing) % 360 + 360) % 360;
}
