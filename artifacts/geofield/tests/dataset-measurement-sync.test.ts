import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDatasetId, reassignMeasurementRecords } from "../src/lib/dataset-identity.ts";
import { mergeMeasurements } from "../src/lib/merge-measurements.ts";

const updatedAt = "2026-09-17T12:00:00.000Z";
const now = Date.parse(updatedAt);

for (const measurementType of ["plane", "lineation"]) {
  test(`${measurementType}: dataset upload advances revision so stale cloud cannot undo assignment`, () => {
    const local = { id: "measurement", measurementType, datasetId: -123 as string | number | null, updatedAt, photo: "local-photo" };
    const reassigned = reassignMeasurementRecords([local], -123, "cloud-dataset", now);
    assert.ok(Date.parse(reassigned[0].updatedAt) > Date.parse(updatedAt));
    const staleCloud = { ...local, datasetId: null, photo: undefined };
    assert.deepEqual(mergeMeasurements(reassigned, [staleCloud], reassigned), reassigned);
    const acknowledged = { ...reassigned[0], photo: undefined };
    assert.deepEqual(mergeMeasurements(reassigned, [acknowledged], reassigned), reassigned);
  });
}

test("a dataset still waiting to upload retains its assignment despite a newer cloud response", () => {
  const local = { id: "measurement", datasetId: -123 as number | string | null, updatedAt };
  const cloud = { ...local, datasetId: null, updatedAt: "2026-09-17T13:00:00.000Z" };
  assert.deepEqual(mergeMeasurements([local], [cloud], [local]), [local]);
});

test("old dataset URLs and assignments resolve to the same cloud identity", () => {
  const datasets = [{ id: -123, cloudId: "cloud-dataset" }];
  assert.equal(resolveDatasetId("-123", datasets), resolveDatasetId("cloud-dataset", datasets));
  assert.equal(resolveDatasetId(-456, datasets), -456);
  assert.equal(resolveDatasetId(null, datasets), null);
});

test("dataset reassignment during download is preserved even against a newer cloud record", () => {
  const before = { id: "measurement", datasetId: -123 as string | number, updatedAt };
  const current = reassignMeasurementRecords([before], -123, "cloud-dataset", now);
  const remote = { ...before, updatedAt: "2026-09-17T13:00:00.000Z" };
  assert.deepEqual(mergeMeasurements(current, [remote], [before]), current);
});

test("reassignment is idempotent and does not modify unrelated records or photos", () => {
  const records = [{ id: "a", datasetId: -123 as number | string, updatedAt, photo: "photo" }, { id: "b", datasetId: "other", updatedAt, photo: "other-photo" }];
  const mapped = reassignMeasurementRecords(records, -123, "cloud", now);
  assert.equal(mapped[0].photo, "photo");
  assert.equal(mapped[1], records[1]);
  assert.deepEqual(reassignMeasurementRecords(mapped, -123, "cloud", now + 1000), mapped);
});

test("moving to Uncategorized is a newer edit that survives a stale assigned cloud record", () => {
  const before = { id: "measurement", datasetId: "cloud" as string | null, updatedAt };
  const unassigned = reassignMeasurementRecords([before], "cloud", null, now);
  assert.equal(unassigned[0].datasetId, null);
  assert.deepEqual(mergeMeasurements(unassigned, [before], unassigned), unassigned);
});
