import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeMeasurementJson, encodeMeasurementJson } from "../src/measurement-json.ts";

const fixtures = {
  orientationQuaternion: { x: 0, y: 0.7071067811865476, z: 0, w: 0.7071067811865476 },
  planeNormal: { east: -0.5, north: 0, up: 0.8660254037844386 },
  lineVector: { east: 0, north: 1, up: 0 },
};

for (const [field, value] of Object.entries(fixtures)) {
  test(`${field} preserves measurement values through AWSJSON upload and download`, () => {
    const original = structuredClone(value);
    const encoded = encodeMeasurementJson(value);
    assert.equal(typeof encoded, "string");
    assert.deepEqual(JSON.parse(encoded!), value);
    assert.deepEqual(decodeMeasurementJson(encoded), value);
    assert.deepEqual(decodeMeasurementJson(value), value);
    // An older downloaded/cached JSON string must not be encoded twice.
    assert.equal(encodeMeasurementJson(encoded), encoded);
    assert.deepEqual(value, original);
  });
}

test("missing optional orientation data stays absent", () => {
  assert.equal(encodeMeasurementJson(undefined), undefined);
  assert.equal(encodeMeasurementJson(null), null);
  assert.equal(decodeMeasurementJson(undefined), undefined);
  assert.equal(decodeMeasurementJson(null), undefined);
});

test("malformed cached JSON fails explicitly instead of uploading corrupted data", () => {
  assert.throws(() => encodeMeasurementJson("{broken"), SyntaxError);
});
