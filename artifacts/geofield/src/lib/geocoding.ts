export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export function parseLatLngSearch(raw: string): GeocodeResult | null {
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng };
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const coords = parseLatLngSearch(trimmed);
  if (coords) return coords;

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Address lookup failed");

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    label: first.display_name || trimmed,
    lat,
    lng,
  };
}
