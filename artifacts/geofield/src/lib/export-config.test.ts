import assert from "node:assert/strict";
import test from "node:test";
import type { Sample } from "@workspace/api-client-react";
import { getSampleColumns, sampleToDataRow } from "./export-config.ts";

function sample(id: string, customParams: Array<{ label: string; value: unknown }>): Sample {
  return {
    id,
    sampleId: id,
    sampleType: "rock",
    userId: "test-user",
    folderId: null,
    notes: "",
    fields: { customParams },
    createdAt: "2026-07-31T12:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
  };
}

test("exports custom parameter labels as columns and values as cells", () => {
  const first = sample("R-1", [
    { label: "Fracture spacing", value: "12 cm" },
    { label: "Weathering grade", value: 3 },
  ]);
  const second = sample("R-2", [
    { label: "Fracture spacing", value: "18 cm" },
  ]);

  const columns = getSampleColumns([first, second]);
  const customColumns = columns.filter((column) =>
    ["Fracture spacing", "Weathering grade"].includes(column.label)
  );
  assert.deepEqual(customColumns.map((column) => column.label), [
    "Fracture spacing",
    "Weathering grade",
  ]);
  assert.equal(columns.some((column) => column.label === "custom Params"), false);

  const firstRow = sampleToDataRow(first, "Outcrop A");
  const secondRow = sampleToDataRow(second, "Outcrop A");
  const fractureColumn = customColumns.find((column) => column.label === "Fracture spacing")!;
  const weatheringColumn = customColumns.find((column) => column.label === "Weathering grade")!;

  assert.equal(firstRow[fractureColumn.key], "12 cm");
  assert.equal(firstRow[weatheringColumn.key], 3);
  assert.equal(secondRow[fractureColumn.key], "18 cm");
  assert.equal(secondRow[weatheringColumn.key], undefined);
});

test("keeps repeated custom parameter names in separate columns", () => {
  const record = sample("R-3", [
    { label: "Reading", value: 10 },
    { label: "Reading", value: 20 },
  ]);
  const columns = getSampleColumns([record]).filter((column) => column.label === "Reading");
  const row = sampleToDataRow(record, "Outcrop B");

  assert.equal(columns.length, 2);
  assert.deepEqual(columns.map((column) => row[column.key]), [10, 20]);
});
