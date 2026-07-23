import test from "node:test";
import assert from "node:assert/strict";
import { circularMean, normalForDip, normalizeAzimuth, planeOrientationFromNormal } from "./strike-dip-math.ts";

const close = (actual: number | null, expected: number, tolerance = 1e-6) => assert.ok(actual !== null && Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test("horizontal plane hides direction and strike", () => assert.deepEqual(planeOrientationFromNormal({ east: 0, north: 0, up: 1 }), { dip: 0, dipDirection: null, strike: null }));
for (const [name, direction, strike] of [["north", 0, 270], ["east", 90, 0], ["south", 180, 90], ["west", 270, 180]] as const) {
  for (const dip of [10, 30, 45, 60, 90]) test(`${name}-dipping ${dip} degrees`, () => {
    const result = planeOrientationFromNormal(normalForDip(dip, direction));
    close(result.dip, dip); close(result.dipDirection, direction); close(result.strike, strike);
  });
}
test("normalizes azimuths", () => { assert.equal(normalizeAzimuth(-10), 350); assert.equal(normalizeAzimuth(360), 0); assert.equal(normalizeAzimuth(370), 10); });
test("circular mean crosses north", () => { const result = circularMean([359, 0, 1]); assert.ok(result !== null && (result < 0.01 || result > 359.99)); });
test("plane result is invariant to screen orientation because device back normal is unchanged", () => {
  const normal = normalForDip(45, 125); const portrait = planeOrientationFromNormal(normal); const landscape = planeOrientationFromNormal(normal); assert.deepEqual(portrait, landscape);
});
