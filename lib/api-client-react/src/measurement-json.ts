// AppSync AWSJSON inputs must be JSON strings. Responses may already be decoded
// by Amplify; accept both representations so locally cached records round-trip.
export function decodeMeasurementJson(value: unknown): unknown {
  if (value == null) return undefined;
  return typeof value === "string" ? JSON.parse(value) : value;
}

export function encodeMeasurementJson(value: unknown): string | null | undefined {
  if (value == null) return value;
  return JSON.stringify(decodeMeasurementJson(value));
}
