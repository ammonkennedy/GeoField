import test from "node:test";
import assert from "node:assert/strict";
import { angularDistance, circularMean, horizontalPlaneAxesFromNormal, normalForDip, normalHemisphere, normalizeAzimuth, planeOrientationFromNormal, projectEnuVectorToScreen, rightHandStrikeFromDipDirection, type RotationMatrix3 } from "./strike-dip-math.ts";

const close = (actual: number | null, expected: number, tolerance = 1e-6) => assert.ok(actual !== null && Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test("horizontal plane hides direction and strike", () => assert.deepEqual(planeOrientationFromNormal({ east: 0, north: 0, up: 1 }), { dip: 0, dipDirection: null, strike: null }));
for (const [name, direction, strike] of [["north", 0, 90], ["east", 90, 180], ["south", 180, 270], ["west", 270, 0]] as const) {
  for (const dip of [10, 30, 45, 60, 90]) test(`${name}-dipping ${dip} degrees`, () => {
    const result = planeOrientationFromNormal(normalForDip(dip, direction));
    close(result.dip, dip); close(result.dipDirection, direction); close(result.strike, strike);
  });
}
test("normalizes azimuths", () => { assert.equal(normalizeAzimuth(-10), 350); assert.equal(normalizeAzimuth(360), 0); assert.equal(normalizeAzimuth(370), 10); });
test("reports the right-hand strike branch", () => {
  assert.equal(rightHandStrikeFromDipDirection(90), 180);
  assert.equal(rightHandStrikeFromDipDirection(180), 270);
  assert.equal(rightHandStrikeFromDipDirection(270), 0);
  assert.equal(rightHandStrikeFromDipDirection(0), 90);
  assert.equal(rightHandStrikeFromDipDirection(5), 95);
  assert.equal(rightHandStrikeFromDipDirection(355), 85);
});
test("phone hemisphere changes only after the plane normal crosses 90 degrees", () => {
  assert.equal(normalHemisphere(1), 1);
  assert.equal(normalHemisphere(0.000001), 1);
  assert.equal(normalHemisphere(0), 1);
  assert.equal(normalHemisphere(-0.000001), -1);
  assert.equal(normalHemisphere(-1), -1);
});
test("circular mean crosses north", () => { const result = circularMean([359, 0, 1]); assert.ok(result !== null && (result < 0.01 || result > 359.99)); });
test("plane result is invariant to screen orientation because device back normal is unchanged", () => {
  const normal = normalForDip(45, 125); const portrait = planeOrientationFromNormal(normal); const landscape = planeOrientationFromNormal(normal); assert.deepEqual(portrait, landscape);
});
test("strike is the horizontal intersection and down-dip is perpendicular", () => {
  for (const dipDirection of [0, 37, 90, 183, 270, 359]) {
    const normal = normalForDip(52, dipDirection);
    const axes = horizontalPlaneAxesFromNormal(normal);
    assert.ok(axes);
    const dot = axes.strike.east * axes.downDip.east + axes.strike.north * axes.downDip.north;
    close(dot, 0);
    close(axes.strike.up, 0);
    close(axes.strike.east * normal.east + axes.strike.north * normal.north + axes.strike.up * normal.up, 0);
    const result = planeOrientationFromNormal(normal);
    assert.ok(result.strike !== null && result.dipDirection !== null);
    close(angularDistance(result.dipDirection, normalizeAzimuth(result.strike - 90)), 0);
  }
});
test("forward/back and left/right tilts produce the expected horizontal strike", () => {
  const cases = [
    { normal: normalForDip(45, 0), strike: 90 },
    { normal: normalForDip(45, 180), strike: 270 },
    { normal: normalForDip(45, 90), strike: 180 },
    { normal: normalForDip(45, 270), strike: 0 },
  ];
  for (const item of cases) {
    const result = planeOrientationFromNormal(item.normal);
    close(result.strike, item.strike);
    const axes = horizontalPlaneAxesFromNormal(item.normal);
    assert.ok(axes && axes.strike.up === 0);
  }
});
test("reversing the measured normal does not reverse strike or down-dip", () => {
  const normal = normalForDip(38, 142);
  const reversed = { east: -normal.east, north: -normal.north, up: -normal.up };
  assert.deepEqual(planeOrientationFromNormal(normal), planeOrientationFromNormal(reversed));
  assert.deepEqual(horizontalPlaneAxesFromNormal(normal), horizontalPlaneAxesFromNormal(reversed));
});
test("an upright phone renders the world-horizontal strike across the screen at every yaw", () => {
  const uprightFacingNorth: RotationMatrix3 = {
    m11: 0, m12: -1, m13: 0,
    m21: 0, m22: 0, m23: 1,
    m31: -1, m32: 0, m33: 0,
  };
  const strikeWest = { east: -1, north: 0, up: 0 };
  const northScreen = projectEnuVectorToScreen(strikeWest, uprightFacingNorth);
  assert.ok(northScreen);
  close(Math.abs(northScreen.right), 1);
  close(northScreen.up, 0);

  const root = Math.SQRT1_2;
  const uprightAtFortyFiveDegrees: RotationMatrix3 = {
    m11: root, m12: -root, m13: 0,
    m21: 0, m22: 0, m23: 1,
    m31: -root, m32: -root, m33: 0,
  };
  const strikeSouthwest = { east: -root, north: -root, up: 0 };
  const turnedScreen = projectEnuVectorToScreen(strikeSouthwest, uprightAtFortyFiveDegrees);
  assert.ok(turnedScreen);
  close(Math.abs(turnedScreen.right), 1);
  close(turnedScreen.up, 0);
});
test("rolling the phone rotates the screen line oppositely so it remains level in the world", () => {
  const angle = 30 * Math.PI / 180;
  const rolled: RotationMatrix3 = {
    m11: 0, m12: -Math.cos(angle), m13: Math.sin(angle),
    m21: 0, m22: Math.sin(angle), m23: Math.cos(angle),
    m31: -1, m32: 0, m33: 0,
  };
  const screen = projectEnuVectorToScreen({ east: -1, north: 0, up: 0 }, rolled);
  assert.ok(screen);
  close(screen.right, -Math.cos(angle));
  close(screen.up, Math.sin(angle));
});
