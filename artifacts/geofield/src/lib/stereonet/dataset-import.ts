import {
  datasetOptions,
  datasetSelected,
  type DatasetSelection,
} from "../dataset-selection.ts";
import { resolveDatasetId, type DatasetIdentity } from "../dataset-identity.ts";
import type { StrikeDipMeasurement } from "../strike-dip-measurements.ts";
import {
  importMeasurement,
  newGroup,
  normalizedMeasurement,
  type Stereonet,
  type North,
} from "./model.ts";

/** Prefer the reference that plots the most records without inventing a correction. */
export function compatibleReference(net: Stereonet): North {
  const score = (north: North) =>
    net.measurements.filter((m) => {
      const group = net.groups.find((g) => g.id === m.groupId);
      if (!group) return false;
      try {
        normalizedMeasurement(m, group, north);
        return true;
      } catch {
        return false;
      }
    }).length;
  const alternative = net.north === "true" ? "magnetic" : "true";
  return score(alternative) > score(net.north) ? alternative : net.north;
}

export function importMeasurementDatasets(
  net: Stereonet,
  measurements: StrikeDipMeasurement[],
  datasets: (DatasetIdentity & { name: string })[],
  identities: DatasetIdentity[],
  selection: DatasetSelection,
): Stereonet {
  const options = datasetOptions(
    datasets,
    identities,
    measurements.map((m) => m.datasetId),
  );
  const next = {
    ...net,
    groups: [...net.groups],
    measurements: [...net.measurements],
  };
  const colors = [
    "#1676e8",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#d97706",
    "#0891b2",
  ];
  for (const option of options.filter(
    (o) => o.count && datasetSelected(selection, o.id, identities),
  )) {
    let group = next.groups.find(
      (g) =>
        g.sourceDatasetId !== undefined &&
        String(
          resolveDatasetId(g.sourceDatasetId || null, identities) ?? "",
        ) === option.id,
    );
    if (!group) {
      group = {
        ...newGroup(option.name),
        sourceDatasetId: option.id,
        color:
          colors[
            next.groups.filter((g) => g.sourceDatasetId !== undefined).length %
              colors.length
          ],
      };
      next.groups.push(group);
    } else
      next.groups = next.groups.map((g) =>
        g.id === group!.id ? { ...g, visible: true } : g,
      );
    for (const m of measurements.filter((m) =>
      datasetSelected([option.id], m.datasetId, identities),
    )) {
      if (
        !next.measurements.some(
          (n) => n.sourceId === m.id && n.groupId === group!.id,
        )
      )
        next.measurements.push(importMeasurement(m, group.id));
    }
  }
  // Drop only the unused starter group; preserve populated and user-created groups.
  if (
    !net.measurements.length &&
    net.groups.length === 1 &&
    net.groups[0].name === "Dataset 1" &&
    next.groups.length > 1
  )
    next.groups = next.groups.filter((g) => g.id !== net.groups[0].id);
  next.north = compatibleReference(next);
  return next;
}
