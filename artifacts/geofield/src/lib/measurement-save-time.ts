export function toLocalDateTimeInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** Stamp at the save action, not when a draft opened or when GPS finishes. */
export function stampMeasurementAtSave<T>(measurement: T, savedAt = new Date()) {
  return {
    ...measurement,
    date: toLocalDateTimeInputValue(savedAt),
    createdAt: savedAt.toISOString(),
    updatedAt: savedAt.toISOString(),
  };
}
