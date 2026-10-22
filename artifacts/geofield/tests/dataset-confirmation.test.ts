import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmDatasetContent } from "../src/lib/dataset-confirmation.ts";
test("dataset confirmation rejects missing, mismatched and partially saved content", () => {
 const expected = { name: "Trip", description: "Offline notes" };
 for (const saved of [null, { id: "wrong", ...expected }, { id: "right", name: "Trip" }, { id: "right", name: "Old", description: "Offline notes" }]) {
  assert.throws(() => confirmDatasetContent(saved, expected, "right"), /remains saved/);
 }
 confirmDatasetContent({ id: "right", ...expected }, expected, "right");
 confirmDatasetContent({ id: "right", name: "Trip", description: null }, { name: "Trip" }, "right");
});
