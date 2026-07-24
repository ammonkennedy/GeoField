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
  const results = await geocodeAddressSuggestions(query, 1);
  return results[0] ?? null;
}

export async function geocodeAddressSuggestions(query: string, limit = 6, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const coords = parseLatLngSearch(trimmed);
  if (coords) return [coords];

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    limit: String(limit),
    addressdetails: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Address lookup failed");

  const results = await response.json();
  if (!Array.isArray(results)) return [];
  return results.flatMap((result: any) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? [{ label: result.display_name || trimmed, lat, lng }]
      : [];
  });
}
