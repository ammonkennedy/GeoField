import { resolveDatasetId, type DatasetIdentity } from './dataset-identity.ts';

export type DatasetSelection = 'all' | string[];
export interface DatasetOption { id: string; name: string; count: number }

export function datasetSelected(selection: DatasetSelection, id: string | number | null | undefined, identities: DatasetIdentity[] = []): boolean {
  if (selection === 'all') return true;
  const resolved = String(resolveDatasetId(id, identities) ?? '');
  return selection.some(selected => String(resolveDatasetId(selected, identities) ?? '') === resolved);
}

/** Include uncategorized and referenced datasets even before their metadata loads. */
export function datasetOptions(
  datasets: (DatasetIdentity & { name: string })[], identities: DatasetIdentity[],
  recordDatasetIds: (string | number | null | undefined)[],
): DatasetOption[] {
  const options = new Map<string, DatasetOption>();
  for (const dataset of datasets) {
    const id = String(resolveDatasetId(dataset.id, identities));
    options.set(id, { id, name: dataset.name, count: 0 });
  }
  options.set('', { id: '', name: 'Uncategorized', count: 0 });
  for (const datasetId of recordDatasetIds) {
    const id = String(resolveDatasetId(datasetId, identities) ?? '');
    if (!options.has(id)) options.set(id, { id, name: `Dataset ${id}`, count: 0 });
    options.get(id)!.count++;
  }
  return [...options.values()];
}

export function toggleDataset(selection: DatasetSelection, id: string, options: DatasetOption[], identities: DatasetIdentity[] = []): DatasetSelection {
  const selected = options.filter(option => datasetSelected(selection, option.id, identities)).map(option => option.id);
  return selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];
}

export function datasetSelectionLabel(selection: DatasetSelection, options: DatasetOption[], identities: DatasetIdentity[] = []): string {
  if (selection === 'all') return 'All datasets';
  const names = options.filter(option => datasetSelected(selection, option.id, identities)).map(option => option.name);
  return names.length ? names.join(', ') : 'No datasets selected';
}
