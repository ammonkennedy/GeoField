/** Save each finished attachment so a later network failure cannot lose progress. */
export async function cacheSampleAttachments<T extends { fields?: any }>(
  sample: T,
  cache: (attachment: any) => Promise<any>,
  onProgress?: (sample: T) => void,
): Promise<T> {
  if (!Array.isArray(sample.fields?.media)) return sample;
  const media: any[] = [];
  const snapshot = (items: any[]): T => ({ ...sample, fields: {
    ...sample.fields, media: items,
    primaryPhoto: items.find(item => (item.kind || item.type) === 'photo') ?? sample.fields.primaryPhoto,
  } });
  for (const attachment of sample.fields.media) {
    const cached = await cache(attachment);
    media.push(cached);
    if (cached !== attachment) onProgress?.(snapshot([...media, ...sample.fields.media.slice(media.length)]));
  }
  return snapshot(media);
}
