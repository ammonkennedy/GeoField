import { resolveDatasetId, type DatasetIdentity } from "../dataset-identity.ts";
import type { Stereonet } from "./model.ts";

/** Keep associations from imports, including older snapshots without group source IDs. */
export function stereonetInDataset(
  net: Stereonet,
  datasetId: string | number,
  identities: DatasetIdentity[] = [],
): boolean {
  if (net.deletedAt) return false;
  const target = String(resolveDatasetId(datasetId, identities));
  const matches = (value: unknown) =>
    (typeof value === "string" || typeof value === "number") &&
    value !== "" &&
    String(resolveDatasetId(value, identities)) === target;
  if (net.savedDatasetId !== undefined) return matches(net.savedDatasetId);
  return (
    net.groups.some((group) => matches(group.sourceDatasetId)) ||
    net.measurements.some((m) => matches(m.raw.datasetId))
  );
}
