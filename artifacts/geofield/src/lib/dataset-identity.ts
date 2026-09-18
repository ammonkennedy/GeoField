export interface DatasetIdentity { id: number | string; cloudId?: string }

/** Local dataset links remain valid after the dataset acquires its cloud ID. */
export function resolveDatasetId<T extends string | number | null | undefined>(id: T, datasets: DatasetIdentity[]): T | string {
  return datasets.find((dataset) => String(dataset.id) === String(id))?.cloudId || id;
}

export function reassignMeasurementRecords<T extends { datasetId?: number | string | null; updatedAt?: string }>(
  items: T[], from: number | string, to: number | string | null, now = Date.now(),
): T[] {
  return items.map((item) => String(item.datasetId ?? "") === String(from) && String(from) !== String(to)
    ? { ...item, datasetId: to, updatedAt: new Date(Math.max(now, (Date.parse(item.updatedAt ?? "") || 0) + 1)).toISOString() }
    : item);
}
