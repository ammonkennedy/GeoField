import test from "node:test";
import assert from "node:assert/strict";
import {
  importMeasurement,
  newStereonet,
  repairImportedPlanes,
} from "../src/lib/stereonet/model.ts";
import { pole, project, greatCircle } from "../src/lib/stereonet/math.ts";
import type { StrikeDipMeasurement } from "../src/lib/strike-dip-measurements.ts";
const source = {
  id: "captured",
  label: "Fault",
  strike: "190",
  strikeDegrees: 190,
  dip: "60",
  dipDegrees: 60,
  dipDirectionDegrees: 90,
  convention: "right-hand-rule",
  northReference: "magnetic",
  featureType: "fault",
  notes: "",
} as StrikeDipMeasurement;
test("captured calibrated strike is not replaced by opposite auxiliary dip direction", () => {
  const m = importMeasurement(source, "g");
  assert.equal(m.azimuth, 190);
  assert.equal(m.raw.dipDirectionDegrees, 90);
  const [x, y] = project(pole(m.azimuth, m.inclination));
  assert.ok(x > 0 && y > 0);
  assert.ok(project(greatCircle(m.azimuth, m.inclination)[90])[0] < 0);
});
test("RHR north-striking east-dipping plane keeps its western lower pole", () => {
  const m = importMeasurement(
    { ...source, strikeDegrees: 0, dipDirectionDegrees: 90 },
    "g",
  );
  assert.equal(m.azimuth, 0);
  assert.ok(project(pole(m.azimuth, m.inclination))[0] < 0);
});
test("dip-direction-only records retain the conventional fallback", () => {
  assert.equal(
    importMeasurement(
      {
        ...source,
        strikeDegrees: undefined,
        strike: "",
        dipDirectionDegrees: 90,
      },
      "g",
    ).azimuth,
    0,
  );
});
test("old imported snapshots repair once, preserving originals and manual edits", () => {
  const net = newStereonet("Saved");
  const m = importMeasurement(source, net.groups[0].id);
  net.measurements = [{ ...m, azimuth: 0 }];
  const repaired = repairImportedPlanes(net);
  assert.equal(repaired.measurements[0].azimuth, 190);
  assert.equal(net.measurements[0].azimuth, 0);
  assert.equal(repaired.measurements[0].raw.strikeDegrees, 190);
  assert.equal(repairImportedPlanes(repaired), repaired);
  const edited = {
    ...net,
    measurements: [
      { ...net.measurements[0], raw: { ...m.raw, edits: [{ azimuth: 0 }] } },
    ],
  };
  assert.equal(repairImportedPlanes(edited), edited);
  const deleted = { ...net, deletedAt: new Date().toISOString() };
  assert.equal(repairImportedPlanes(deleted), deleted);
});
