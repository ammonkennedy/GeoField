import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeLineationRecord } from "../src/lib/lineation-record.ts";
const old = { id: "line", measurementType: "plane", label: "Lineation 045°/20°", strike: "", dip: "", photoKey: "media/photo", datasetId: "dataset", date: "2026-09-21T10:00", notes: "Keep" } as any;
test("older label-only lineations recover dedicated azimuth and plunge fields", () => {
  const repaired = normalizeLineationRecord(old);
  assert.equal(repaired.measurementType, "lineation"); assert.equal(repaired.trendDegrees, 45); assert.equal(repaired.plungeDegrees, 20); assert.equal(repaired.label, "Lineation");
  assert.equal(repaired.photoKey, old.photoKey); assert.equal(repaired.datasetId, old.datasetId); assert.equal(repaired.date, old.date); assert.equal(repaired.notes, old.notes);
  assert.equal(normalizeLineationRecord(repaired), repaired);
});
test("real angle fields take precedence over an outdated generated label", () => {
  const repaired = normalizeLineationRecord({ ...old, measurementType: "lineation", trendDegrees: 0, plungeDegrees: 0 });
  assert.equal(repaired.trendDegrees, 0); assert.equal(repaired.plungeDegrees, 0);
});
test("custom labels and actual plane measurements are preserved", () => {
  const custom = { ...old, measurementType: "lineation", label: "Fold hinge", trendDegrees: 150, plungeDegrees: 30 };
  assert.equal(normalizeLineationRecord(custom), custom);
  const plane = { ...old, strike: "45", dip: "20" }; assert.equal(normalizeLineationRecord(plane), plane);
  const invalid = { ...old, label: "Lineation 400°/95°" }; assert.equal(normalizeLineationRecord(invalid), invalid);
});
