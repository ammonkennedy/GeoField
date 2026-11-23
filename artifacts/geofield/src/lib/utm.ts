export interface UTMResult {
  zone: number;
  letter: string;
  easting: number;
  northing: number;
  hemisphere: "N" | "S";
  display: string;
}

export function latLngToUTM(lat: number, lng: number): UTMResult {
  // WGS84 ellipsoid constants
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = 1 - (b * b) / (a * a);
  const ep2 = (a * a - b * b) / (b * b);
  const k0 = 0.9996;
  const E0 = 500000;

  const zone = Math.min(60, Math.floor((lng + 180) / 6) + 1);
  const lngOriginRad = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ep2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lngRad - lngOriginRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) +
    E0;

  const N0 = lat < 0 ? 10000000 : 0;
  const northing =
    k0 *
      (M +
        N *
          Math.tan(latRad) *
          (A ** 2 / 2 +
            ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
            ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720)) +
    N0;

  const letters = "CDEFGHJKLMNPQRSTUVWX";
  const letterIdx = Math.max(0, Math.min(Math.floor((lat + 80) / 8), 19));
  const letter =
    lat >= 84 ? "Z" : lat <= -80 ? "A" : letters[letterIdx];

  const e = Math.round(easting);
  const n = Math.round(northing);
  const hemisphere: "N" | "S" = lat >= 0 ? "N" : "S";

  return {
    zone,
    letter,
    easting: e,
    northing: n,
    hemisphere,
    display: `${zone}${letter}  ${e.toLocaleString()}E  ${n.toLocaleString()}N`,
  };
}

export function parseCoords(raw: unknown): [number, number] | null {
  if (!raw && raw !== 0) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const match = str.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return [lat, lng];
  }
  const nums = str.match(/-?\d+\.?\d*/g);
  if (nums && nums.length >= 2) {
    const lat = parseFloat(nums[0]);
    const lng = parseFloat(nums[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return [lat, lng];
  }
  return null;
}

/** Inverse WGS84 transverse Mercator; hemisphere is separate from latitude band. */
export function utmToLatLng(zone: number, hemisphere: 'N' | 'S', easting: number, northing: number): [number, number] {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60 || !['N', 'S'].includes(hemisphere) ||
      !Number.isFinite(easting) || easting < 100000 || easting > 900000 ||
      !Number.isFinite(northing) || northing < 0 || northing > 10000000) {
    throw new Error('Enter zone 1–60, easting 100000–900000 m and northing 0–10000000 m.');
  }
  const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k = 0.9996;
  const m = (northing - (hemisphere === 'S' ? 10000000 : 0)) / k;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + 151 * e1 ** 3 / 96 * Math.sin(6 * mu) + 1097 * e1 ** 4 / 512 * Math.sin(8 * mu);
  const n = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const r = a * (1 - e2) / (1 - e2 * Math.sin(p) ** 2) ** 1.5;
  const t = Math.tan(p) ** 2, c = ep2 * Math.cos(p) ** 2, d = (easting - 500000) / (n * k);
  const lat = (p - n * Math.tan(p) / r * (d ** 2 / 2 - (5 + 3 * t + 10 * c - 4 * c ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t + 298 * c + 45 * t ** 2 - 252 * ep2 - 3 * c ** 2) * d ** 6 / 720)) * 180 / Math.PI;
  const lng = (zone - 1) * 6 - 177 + (d - (1 + 2 * t + c) * d ** 3 / 6
    + (5 - 2 * c + 28 * t - 3 * c ** 2 + 8 * ep2 + 24 * t ** 2) * d ** 5 / 120) / Math.cos(p) * 180 / Math.PI;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -80.00001 || lat > 84.00001 || lng < -180.00001 || lng > 180.00001 ||
      (hemisphere === 'N' && lat < -1e-7) || (hemisphere === 'S' && lat > 1e-7)) throw new Error('These coordinates are outside the valid UTM area.');
  return [Math.max(-80, Math.min(84, lat)), Math.max(-180, Math.min(180, lng))];
}
