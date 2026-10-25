import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDefaultColumns, loadExportDefault, saveExportDefault } from "../src/lib/export-defaults.ts";

test("export defaults persist independently by type and account, including layout and rows", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  const account = (id: string) => values.set("geofield-account:pool", JSON.stringify({ user: { id } }));
  account("a");
  const water = { key: "water", columns: [{ key: "ph", label: "Acidity", enabled: false }], customRows: [{ id: "1", text: "Field work" }], orientation: "transposed" as const };
  saveExportDefault(water);
  saveExportDefault({ ...water, key: "rock", orientation: "normal" });
  assert.deepEqual(loadExportDefault("water"), water);
  assert.equal(loadExportDefault("rock")?.orientation, "normal");
  account("b");
  assert.equal(loadExportDefault("water"), undefined);
  account("a");
  assert.deepEqual(loadExportDefault("water"), water);
});

test("saved columns retain choices and order while supporting different dataset fields", () => {
  const current = [
    { key: "a", label: "A", enabled: true },
    { key: "b", label: "B", enabled: true },
    { key: "new", label: "New field", enabled: true },
  ];
  const result = applyDefaultColumns(current, [
    { key: "b", label: "Renamed", enabled: false },
    { key: "missing", label: "Missing", enabled: true },
    { key: "a", label: "A", enabled: true },
  ]);
  assert.deepEqual(result.map(c => c.key), ["b", "a", "new"]);
  assert.equal(result[0].label, "Renamed");
  assert.equal(result[0].enabled, false);
  assert.equal(current[1].enabled, true);
});

test("legacy project column label updates without changing its key or custom labels", () => {
  const current = [{key: 'dataset', label: 'Project', enabled: true, defaultWidth: 20}];
  assert.equal(applyDefaultColumns(current, [{...current[0], label: 'Dataset'}])[0].label, 'Project');
  assert.equal(applyDefaultColumns(current, [{...current[0], label: 'Field campaign'}])[0].label, 'Field campaign');
  assert.equal(applyDefaultColumns(current, [{...current[0], label: 'Dataset'}])[0].key, 'dataset');
});
