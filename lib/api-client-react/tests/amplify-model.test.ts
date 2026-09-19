import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAmplifyModel } from "../../../scripts/check-amplify-model.mjs";
const outputs = JSON.parse(readFileSync(new URL("../../../amplify_outputs.json", import.meta.url), "utf8"));

for (const field of ["title", "body", "photos", "deletedAt"]) {
  test(`a build rejects stale notes metadata missing ${field}`, () => {
    const stale = structuredClone(outputs);
    delete stale.data.model_introspection.models.FieldNote.fields[field];
    assert.throws(() => checkAmplifyModel(stale), new RegExp(`FieldNote\\.${field}`));
  });
}

test("bundled deployed metadata requests dataset and lineation fields in measurement responses", () => {
  assert.doesNotThrow(() => checkAmplifyModel(outputs));
});
for (const field of ["measuredAt", "elevation", "elevationAccuracy", "datasetId", "measurementType", "trendDegrees", "plungeDegrees", "lineVector"]) {
  test(`a build rejects stale metadata missing ${field}`, () => {
    const stale = structuredClone(outputs);
    delete stale.data.model_introspection.models.StrikeDipMeasurement.fields[field];
    assert.throws(() => checkAmplifyModel(stale), new RegExp(field));
  });
}
