import type { StrikeDipMeasurement } from "../strike-dip-measurements.ts";
import { line, pole, validateOrientation, wrap, type Vec } from "./math.ts";
export type North = "magnetic" | "true";
export interface NetMeasurement {
  id: string;
  groupId: string;
  kind: "plane" | "line";
  name: string;
  feature: string;
  notes: string;
  azimuth: number;
  inclination: number;
  north: North | "unknown";
  declination?: number;
  raw: Record<string, unknown>;
  sourceId?: string;
  createdAt: string;
}
export interface NetGroup {
  sourceDatasetId?: string;
  id: string;
  name: string;
  color: string;
  symbol: "circle" | "square" | "triangle";
  visible: boolean;
  declination?: number;
  assumedNorth?: North;
}
export interface Stereonet {
  id: string;
  name: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  north: North;
  grid: boolean;
  display: "poles" | "planes" | "both";
  groups: NetGroup[];
  measurements: NetMeasurement[];
  deletedAt?: string;
  localRevision?: string;
  cloudRevision?: string;
}
export function newGroup(name = "Project 1"): NetGroup {
  return {
    id: crypto.randomUUID(),
    name,
    color: "#1676e8",
    symbol: "circle",
    visible: true,
  };
}
export function newStereonet(name: string): Stereonet {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled stereonet",
    createdAt: now,
    updatedAt: now,
    north: "magnetic",
    grid: true,
    display: "both",
    groups: [newGroup()],
    measurements: [],
  };
}
export function normalizedMeasurement(
  m: NetMeasurement,
  group: NetGroup,
  target: North,
) {
  const reference = m.north === "unknown" ? group.assumedNorth : m.north;
  if (!reference)
    throw new Error(
      `${m.name || m.id}: choose the project’s assumed north reference for this legacy measurement.`,
    );
  let azimuth = m.azimuth;
  if (reference !== target) {
    const declination = m.declination ?? group.declination;
    if (!Number.isFinite(declination))
      throw new Error(
        `${m.name || m.id} uses ${reference} north. Switch the plot to ${reference} north, or enter its declination (east positive) in Projects to convert to ${target} north.`,
      );
    azimuth += target === "true" ? declination! : -declination!;
  }
  return { ...m, azimuth: wrap(azimuth) };
}
export function measurementVector(m: NetMeasurement): Vec {
  return m.kind === "plane"
    ? pole(m.azimuth, m.inclination)
    : line(m.azimuth, m.inclination);
}
export function importMeasurement(
  m: StrikeDipMeasurement,
  groupId: string,
): NetMeasurement {
  const kind = m.measurementType === "lineation" ? "line" : "plane";
  // Only accept numeric degree fields or fully numeric legacy strings; never guess quadrant notation.
  const numeric = (value: unknown) =>
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\s*\d+(\.\d+)?\s*°?\s*$/.test(value)
        ? Number(value.replace("°", ""))
        : NaN;
  // Recorded RHR strike is the user's calibrated measurement. Older sensor
  // captures also contain an oppositely directed, uncalibrated dipDirection;
  // deriving strike from that auxiliary field reverses the plotted plane.
  const recordedStrike = numeric(m.strikeDegrees ?? m.strike);
  const azimuth =
    kind === "line"
      ? numeric(m.trendDegrees)
      : Number.isFinite(recordedStrike)
        ? recordedStrike
        : Number.isFinite(m.dipDirectionDegrees)
          ? wrap(m.dipDirectionDegrees! - 90)
          : NaN;
  const inclination =
    kind === "line" ? numeric(m.plungeDegrees) : numeric(m.dipDegrees ?? m.dip);
  validateOrientation(azimuth, inclination);
  const { photo, ...metadata } = m;
  return {
    id: crypto.randomUUID(),
    groupId,
    kind,
    name: m.label,
    feature: m.featureType || "other",
    notes: m.notes || "",
    azimuth: wrap(azimuth),
    inclination,
    north: m.northReference ?? m.referenceFrame ?? "unknown",
    declination: m.magneticDeclination,
    raw: { ...metadata, photoOmitted: !!photo },
    sourceId: m.id,
    createdAt: new Date().toISOString(),
  };
}
export function plottedMeasurements(net: Stereonet, feature = "") {
  const items: NetMeasurement[] = [],
    errors: string[] = [];
  for (const m of net.measurements) {
    const group = net.groups.find((g) => g.id === m.groupId);
    if (!group?.visible || (feature && m.feature !== feature)) continue;
    try {
      items.push(normalizedMeasurement(m, group, net.north));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { items, errors };
}

/** Repair only untouched snapshots made by the old dip-direction-first importer. */
export function repairImportedPlanes(net: Stereonet): Stereonet {
  if (net.deletedAt) return net;
  let changed = false;
  const measurements = net.measurements.map((m) => {
    if (
      m.kind !== "plane" ||
      !m.sourceId ||
      m.raw.edits ||
      m.raw.stereonetImportRepair
    )
      return m;
    const source = m.raw as unknown as StrikeDipMeasurement;
    if (!Number.isFinite(source.dipDirectionDegrees)) return m;
    const oldAzimuth = wrap(source.dipDirectionDegrees! - 90);
    if (Math.abs(m.azimuth - oldAzimuth) > 1e-8) return m;
    try {
      const corrected = importMeasurement(source, m.groupId);
      if (
        Math.abs(corrected.azimuth - m.azimuth) < 1e-8 ||
        corrected.inclination !== m.inclination
      )
        return m;
      changed = true;
      return {
        ...m,
        azimuth: corrected.azimuth,
        raw: {
          ...m.raw,
          stereonetImportRepair: {
            previousAzimuth: m.azimuth,
            reason:
              "Use recorded RHR strike rather than auxiliary dip direction",
          },
        },
      };
    } catch {
      return m;
    }
  });
  return changed ? { ...net, measurements } : net;
}
