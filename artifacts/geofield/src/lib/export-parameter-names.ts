/** Conservative export-only aliases. Units remain part of a parameter's identity. */
export function normalizedParameterLabel(label: string, sampleType?: string): string {
  const clean = label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  // Confirmed historical water-sheet labels used mmHg even when omitted.
  if (sampleType === 'water' && /^(?:barometric )?pressure$/.test(clean)) return 'barometric pressure (mmHg)';
  if (/^specific conductance(?:\s*\(spc\))?$/.test(clean)) return 'specific conductance (spc)';
  if (/^dissolved oxygen\s*(?:%|\(%\))$/.test(clean)) return 'dissolved oxygen (%)';
  if (/^(?:barometric )?pressure\s*(?:mm\s*\/?\s*hg|\(mm\s*\/?\s*hg\))$/.test(clean)) return 'barometric pressure (mmHg)';
  return clean;
}
export function normalizedCustomExportKey(key: string, sampleType?: string): string {
  const match = /^_customParameter:(.*):(\d+)$/.exec(key);
  return match ? `_customParameter:${normalizedParameterLabel(match[1], sampleType)}:${match[2]}` : key;
}
