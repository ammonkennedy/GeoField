import assert from "node:assert/strict";
import { test } from "node:test";
import { strikeDipToDataRow } from "../src/lib/export-config.ts";
import type { StrikeDipMeasurement } from "../src/lib/strike-dip-measurements.ts";

const measurement: StrikeDipMeasurement = {
  id: "test", label: "Lineation", measurementType: "lineation",
  trendDegrees: 123, plungeDegrees: 28,
  strike: "old strike", dip: "old dip", dipDir: "old direction",
  location: "", date: "", featureType: "Lineation", rockLayerType: "", notes: "",
};

test("lineation exports azimuth and plunge without legacy strike/dip values", () => {
  const row = strikeDipToDataRow(measurement, 0, "Dataset");
  assert.equal(row.azimuth, 123);
  assert.equal(row.plunge, 28);
  assert.equal(row.strike, "");
  assert.equal(row.dip, "");
  assert.equal(row.dipDir, "");
});
test("zero lineation angles remain valid values", () => {
  const row = strikeDipToDataRow({ ...measurement, trendDegrees: 0, plungeDegrees: 0 }, 0, "Dataset");
  assert.equal(row.azimuth, 0);
  assert.equal(row.plunge, 0);
});
test("plane measurements keep strike and dip columns", () => {
  const row = strikeDipToDataRow({ ...measurement, measurementType: "plane", strike: "045", dip: "30" }, 0, "Dataset");
  assert.equal(row.strike, "045");
  assert.equal(row.dip, "30");
  assert.equal(row.azimuth, "");
  assert.equal(row.plunge, "");
});
