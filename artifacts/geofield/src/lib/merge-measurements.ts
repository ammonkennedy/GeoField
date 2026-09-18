export interface MeasurementRecord {
  localRevision?: string;
  id: string;
  photo?: string;
  datasetId?: number | string | null;
  updatedAt?: string;
}

/** Merge against current storage, not the snapshot taken before network requests. */
export function mergeMeasurements<T extends MeasurementRecord>(
  current: T[],
  remote: T[],
  beforeSync: T[],
): T[] {
  const beforeById = new Map(beforeSync.map((item) => [item.id, item]));
  const currentById = new Map(current.map((item) => [item.id, item]));
  const merged = [...current];
  for (const cloud of remote) {
    const local = currentById.get(cloud.id);
    const before = beforeById.get(cloud.id);
    if (!local) {
      // A measurement deleted during the request must not be brought back.
      if (!before) merged.push(cloud);
      continue;
    }
    // A dataset that has not uploaded yet cannot be represented by the cloud.
    // In particular, its missing cloud assignment must not erase the local link.
    if (local.localRevision || Number(local.datasetId) < 0) continue;
    // Keep edits made while uploads/downloads were in flight, including explicit
    // photo removal. They will be considered for upload on the next sync.
    if (!before || JSON.stringify(local) !== JSON.stringify(before)) continue;
    if (!local.updatedAt || Date.parse(cloud.updatedAt ?? '') > Date.parse(local.updatedAt)) {
      const position = merged.findIndex((item) => item.id === cloud.id);
      // Photos are currently local-only. A cloud record's missing photo field
      // is not a deletion instruction, even when its timestamp is newer.
      merged[position] = { ...cloud, photo: local.photo };
    }
  }
  return merged;
}
