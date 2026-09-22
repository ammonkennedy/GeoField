// GPS metadata is device-generated, not a manually entered sample parameter.
// Preserve its precision without making an otherwise valid sample unsavable.
const LOCATION_FIELDS = new Set([
  "location", "latitude", "longitude", "gpsAccuracy", "accuracy",
  "elevation", "elevationAccuracy", "altitude", "altitudeAccuracy",
  "utmEasting", "utmNorthing", "utmZone",
]);
export function exceedsSevenDecimalPlaces(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return false;
  const mantissa = text.split(/[eE]/)[0];
  return (mantissa.split(".")[1]?.length ?? 0) > 7;
}
export function findSamplePrecisionError(fields: Record<string, unknown>, customParams: Array<{ label: string; value: unknown }>): string | undefined {
  const invalid = Object.entries(fields).find(([key, value]) => !LOCATION_FIELDS.has(key) && exceedsSevenDecimalPlaces(value));
  if (invalid) return invalid[0].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return customParams.find((parameter) => parameter.label.trim() && exceedsSevenDecimalPlaces(parameter.value))?.label;
}
