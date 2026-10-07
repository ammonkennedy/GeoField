/** Collect fresh fixes rather than accepting a cached or coarse first position.
 * Accuracy is the receiver's estimate, not a guarantee. Never average positions:
 * the user may be moving, and fixes can share the same systematic error.
 */
export function getAccuratePosition(
  geolocation: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined = globalThis.navigator?.geolocation,
  durationMs = 15000,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error("Geolocation is unavailable")); return; }
    const started = Date.now();
    let best: GeolocationPosition | undefined;
    let bestWithElevation: GeolocationPosition | undefined;
    const hasElevation = (position: GeolocationPosition) => typeof position.coords.altitude === "number" && Number.isFinite(position.coords.altitude);
    let watchId: number | undefined;
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (watchId !== undefined) geolocation.clearWatch(watchId);
      // Prefer a complete fix only when its horizontal accuracy is comparable.
      // Keep all coordinates from one reading; never combine heights from another location.
      if (bestWithElevation && best && bestWithElevation.coords.accuracy <= best.coords.accuracy + 1) resolve(bestWithElevation);
      else if (best) resolve(best);
      else reject(error ?? new Error("GPS_TIMEOUT"));
    };
    const timer = setTimeout(() => finish(), durationMs);
    try {
      watchId = geolocation.watchPosition(position => {
        if (done) return;
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(position.timestamp) || position.timestamp < started ||
            !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
            !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
            !Number.isFinite(accuracy) || accuracy < 0) return;
        if (!best || accuracy <= best.coords.accuracy) best = position;
        if (hasElevation(position) && (!bestWithElevation || accuracy <= bestWithElevation.coords.accuracy)) bestWithElevation = position;
        if (accuracy <= 3 && hasElevation(position)) finish();
      }, error => {
        // Temporary failures may be followed by a good fix. Permission denial cannot.
        if (error.code === 1) finish(error);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: durationMs });
      if (done) geolocation.clearWatch(watchId);
    } catch (error) { finish(error); }
  });
}
