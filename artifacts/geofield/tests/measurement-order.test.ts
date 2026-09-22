import assert from "node:assert/strict";
import { test } from "node:test";
import { orderMeasurements } from "../src/lib/measurement-order.ts";

test("shuffled cloud downloads display in original save order with photos attached", () => {
  const first = { id: "plane", createdAt: "2026-09-20T10:00:00Z", photoKey: "media/plane", measurementType: "plane" };
  const second = { id: "line", createdAt: "2026-09-20T10:01:00Z", photoKey: "media/line", measurementType: "lineation" };
  const downloaded = [second, first];
  assert.deepEqual(orderMeasurements(downloaded), [first, second]);
  assert.deepEqual(downloaded, [second, first]);
  assert.equal(orderMeasurements(downloaded)[0], first);
});
test("photo uploads and later edits do not reorder saved measurements", () => {
  const records = [
    { id: "first", createdAt: "2026-09-20T10:00:00Z", updatedAt: "2026-09-21T10:00:00Z", date: "2026-09-22T10:00" },
    { id: "second", createdAt: "2026-09-20T11:00:00Z", updatedAt: "2026-09-20T11:00:00Z" },
  ];
  assert.deepEqual(orderMeasurements(records).map((item) => item.id), ["first", "second"]);
});
test("legacy dates and undated records have deterministic fallback ordering", () => {
  const records = [{ id: "z" }, { id: "b", createdAt: "invalid", date: "2026-09-21T11:00" }, { id: "a", date: "2026-09-21T10:00" }, { id: "y", date: "invalid" }];
  assert.deepEqual(orderMeasurements(records).map((item) => item.id), ["a", "b", "y", "z"]);
});
test("identical timestamps have the same order on both devices", () => {
  const records = ["z", "a", "m"].map((id) => ({ id, createdAt: "2026-09-20T10:00:00Z" }));
  assert.deepEqual(orderMeasurements(records), orderMeasurements([...records].reverse()));
});
