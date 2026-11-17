/** A malformed cloud record must never become an apparently empty editable sample. */
export function parseSampleFields(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  let fields: unknown = value;
  if (typeof fields === 'string') {
    try { fields = JSON.parse(fields); }
    catch { throw new Error('Sample fields could not be read. The original cloud data has not been changed.'); }
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('Sample fields have an invalid format. The original cloud data has not been changed.');
  }
  return fields as Record<string, unknown>;
}

export function sampleUpdateCondition(updatedAt: string) {
  if (!updatedAt) throw new Error('The saved sample revision is required before updating.');
  return { updatedAt: { eq: updatedAt } };
}
