import test from "node:test";
import assert from "node:assert/strict";
import {
  line,
  pole,
  project,
  greatCircle,
  smallCircle,
  dot,
  orientation,
  intersection,
  axialMean,
  girdle,
  directionalMean,
} from "../src/lib/stereonet/math.ts";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("cardinal directions and vertical line project correctly", () => {
  for (const [t, x, y] of [
    [0, 0, -1],
    [90, 1, 0],
    [180, 0, 1],
    [270, -1, 0],
  ]) {
    const p = project(line(t, 0));
    close(p[0], x);
    close(p[1], y);
  }
  assert.deepEqual(project(line(42, 90)), [0, 0]);
  close(Math.hypot(...project(line(90, 30))), Math.sqrt(0.5));
  close(
    Math.hypot(...project(line(90, 30), "equal-angle")),
    Math.tan(Math.PI / 6),
  );
});
test("horizontal plane perimeter and central pole; vertical plane diameter and rim pole", () => {
  for (const v of greatCircle(0, 0)) close(Math.hypot(...project(v)), 1);
  assert.deepEqual(project(pole(120, 0)), [0, 0]);
  for (const v of greatCircle(0, 90)) close(project(v)[0], 0);
  close(Math.hypot(...project(pole(0, 90))), 1);
});
test("plane paths are perpendicular to their poles including near-vertical planes", () => {
  for (const strike of [0, 47, 180, 359])
    for (const dip of [0, 1, 45, 89.999, 90])
      for (const v of greatCircle(strike, dip)) {
        close(dot(v, pole(strike, dip)), 0);
        assert.ok(v[2] > -1e-10);
      }
  const p = orientation(pole(0, 30));
  close(p.trend, 270);
  close(p.plunge, 60);
});
test("small circles have constant spherical angle from north", () => {
  for (const angle of [10, 60, 90, 140, 170])
    for (const v of smallCircle(angle))
      close(dot(v, line(0, 0)), Math.cos((angle * Math.PI) / 180));
});
test("intersection solves two independent plane equations; parallel planes rejected", () => {
  const result = intersection(pole(0, 90), pole(90, 90));
  close(result.plunge, 90);
  const flat = intersection(pole(0, 0), pole(30, 60));
  close(flat.plunge, 0);
  close(Math.abs(dot(line(flat.trend, flat.plunge), line(30, 0))), 1);
  assert.throws(() => intersection(pole(0, 30), pole(0, 30)));
});
test("axial statistics respect wraparound and antipodal equivalence", () => {
  const mean = axialMean([line(359, 0), line(1, 0), line(180, 0)]);
  close(Math.abs(dot(mean.vector, line(0, 0))), 1);
  const directional = directionalMean([line(359, 30), line(1, 30)]);
  assert.ok(directional.trend < 1e-8 || directional.trend > 359.999);
  assert.throws(
    () => axialMean([line(0, 0), line(90, 0), line(0, 90)]),
    /No well-separated/,
  );
});
test("known cylindrical bedding girdle has north horizontal fold axis", () => {
  const fit = girdle([
    pole(0, 20),
    pole(0, 50),
    pole(0, 80),
    pole(180, 30),
    pole(180, 70),
  ]);
  close(fit.plunge, 0);
  close(Math.abs(dot(line(fit.trend, fit.plunge), line(0, 0))), 1);
  assert.throws(
    () => girdle([pole(0, 30), pole(0, 30), pole(0, 30)]),
    /No well-separated/,
  );
});
test("oblique girdle recovers an independently constructed non-cardinal axis", () => {
  // Every vector on this great circle is analytically perpendicular to its pole.
  const vectors = greatCircle(123, 56).filter((_, i) => i % 20 === 0);
  const fit = girdle(vectors);
  close(Math.abs(dot(line(fit.trend, fit.plunge), pole(123, 56))), 1);
  close(fit.strike, 123);
  close(fit.dip, 56);
});
