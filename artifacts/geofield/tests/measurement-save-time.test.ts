import assert from "node:assert/strict";
import { test } from "node:test";
import { stampMeasurementAtSave, toLocalDateTimeInputValue } from "../src/lib/measurement-save-time.ts";
import { syncMeasurementRecords } from "../src/lib/sync-measurements.ts";

for (const measurementType of ["plane", "lineation"]) {
  test(`${measurementType}: save replaces draft time with local save time`, () => {
    const savedAt = new Date(2026, 8, 18, 14, 37, 42);
    const draft = { id: "m", measurementType, date: "2026-09-18T09:00", notes: "Keep my notes" };
    const saved = stampMeasurementAtSave(draft, savedAt);
    assert.equal(saved.date, "2026-09-18T14:37");
    assert.equal(saved.createdAt, savedAt.toISOString());
    assert.equal(saved.updatedAt, savedAt.toISOString());
    assert.equal(saved.notes, draft.notes);
    assert.equal(draft.date, "2026-09-18T09:00");
  });
}
test("local dates do not shift to the UTC calendar day near midnight", () => {
  assert.equal(toLocalDateTimeInputValue(new Date(2026, 8, 18, 23, 59)), "2026-09-18T23:59");
  assert.equal(toLocalDateTimeInputValue(new Date(2026, 8, 18, 0, 1)), "2026-09-18T00:01");
});
test("save time survives sync and later GPS updates", async () => {
  const saved = stampMeasurementAtSave({ id: "m", datasetId: "dataset", localRevision: "pending", elevation: null as number | null }, new Date(2026, 8, 18, 14, 37));
  let current = [{ ...saved, elevation: 1300, updatedAt: new Date(2026, 8, 18, 14, 38).toISOString() }];
  await syncMeasurementRecords({
    load: () => current,
    save: (records) => { current = records; },
    list: async () => [],
    create: async (record) => record,
    update: async (record) => record,
  });
  assert.equal(current[0].date, "2026-09-18T14:37");
  assert.equal(current[0].createdAt, saved.createdAt);
});
