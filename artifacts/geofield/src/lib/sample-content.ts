export function canonicalJson(value: any): string {
  const normalize = (item: any): any => Array.isArray(item) ? item.map(normalize) : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().filter((key) => item[key] !== undefined).map((key) => [key, normalize(item[key])])) : item;
  return JSON.stringify(normalize(value));
}

function sampleFields(fields: any) {
  if (!fields || typeof fields !== "object") return fields;
  if (!Array.isArray(fields.media)) return fields;
  const media = fields.media.map((item: any) => {
    if (!item?.storageKey?.startsWith("media/")) return item;
    const { cloudUrl: _signed, dataUrl: _hydrated, localKey: _cache, ...content } = item;
    return content;
  });
  const primary = media.find((item: any) => (item.kind || item.type) === "photo");
  return { ...fields, media, primaryPhoto: primary?.storageKey ? { storageKey: primary.storageKey } : fields.primaryPhoto };
}

/** Signed URLs and device-local cache pointers are not edits to a sample. */
export function sameSampleContent(actual: any, expected: any): boolean {
  return actual?.sampleId === expected?.sampleId && actual?.sampleType === expected?.sampleType
    && String(actual?.folderId ?? "") === String(expected?.folderId ?? "")
    && (actual?.notes ?? "") === (expected?.notes ?? "")
    && canonicalJson(sampleFields(actual?.fields)) === canonicalJson(sampleFields(expected?.fields));
}

export async function sampleRecoveryId(id: string, sample: any) {
  const content = canonicalJson({ sampleId: sample.sampleId, sampleType: sample.sampleType, folderId: sample.folderId ?? null, notes: sample.notes ?? "", fields: sampleFields(sample.fields) });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return `${id}-recovered-${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
