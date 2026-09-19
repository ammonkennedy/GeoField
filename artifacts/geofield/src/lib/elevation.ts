/** Device-reported GPS height in metres; null is unavailable, never sea level. */
export function elevationFromCoordinates(coords: { altitude?: number | null; altitudeAccuracy?: number | null }) {
  const elevation = typeof coords.altitude === "number" && Number.isFinite(coords.altitude) ? coords.altitude : null;
  const elevationAccuracy = elevation !== null && typeof coords.altitudeAccuracy === "number" && Number.isFinite(coords.altitudeAccuracy) && coords.altitudeAccuracy >= 0 ? coords.altitudeAccuracy : null;
  return { elevation, elevationAccuracy };
}

export function formatElevation(elevation?: number | null, accuracy?: number | null) {
  if (typeof elevation !== "number" || !Number.isFinite(elevation)) return "Not available from GPS";
  const height = `${elevation.toFixed(1)} m (${(elevation * 3.280839895).toFixed(0)} ft)`;
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? `${height} · ±${accuracy.toFixed(1)} m` : height;
}
