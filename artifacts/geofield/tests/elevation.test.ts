import assert from "node:assert/strict";
import { test } from "node:test";
import { elevationFromCoordinates, formatElevation } from "../src/lib/elevation.ts";

test("GPS height and vertical accuracy retain their metric values", () => {
  assert.deepEqual(elevationFromCoordinates({ altitude: 1532.25, altitudeAccuracy: 6.5 }), { elevation: 1532.25, elevationAccuracy: 6.5 });
  assert.equal(formatElevation(1532.25, 6.5), "1532.3 m (5027 ft) · ±6.5 m");
});
test("zero and below-sea-level heights remain valid measurements", () => {
  assert.equal(elevationFromCoordinates({ altitude: 0 }).elevation, 0);
  assert.equal(elevationFromCoordinates({ altitude: -85.4 }).elevation, -85.4);
});
test("missing or invalid readings do not become zero", () => {
  for (const altitude of [null, undefined, NaN, Infinity]) {
    assert.deepEqual(elevationFromCoordinates({ altitude, altitudeAccuracy: 2 }), { elevation: null, elevationAccuracy: null });
    assert.equal(formatElevation(altitude), "Not available from GPS");
  }
});
test("missing or negative vertical accuracy is not presented as reliable", () => {
  assert.deepEqual(elevationFromCoordinates({ altitude: 10, altitudeAccuracy: -1 }), { elevation: 10, elevationAccuracy: null });
  assert.equal(formatElevation(10, null), "10.0 m (33 ft)");
});
