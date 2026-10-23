/** East, north, down unit vectors. Azimuth clockwise from north; degrees. */
export type Vec = [number, number, number];
export type Projection = "equal-area" | "equal-angle";
const rad = Math.PI / 180;
export const wrap = (angle: number) => ((angle % 360) + 360) % 360;
export const dot = (a: Vec, b: Vec) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);
export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function unit(v: Vec): Vec {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-10)
    throw new Error("Orientation is undefined.");
  return v.map((value) => value / length) as Vec;
}
export function lower(v: Vec): Vec {
  const n = unit(v);
  return n[2] < -1e-12
    ? (n.map((value) => -value) as Vec)
    : [n[0], n[1], Math.max(0, n[2])];
}
export function validateOrientation(azimuth: number, inclination: number) {
  if (
    !Number.isFinite(azimuth) ||
    !Number.isFinite(inclination) ||
    inclination < 0 ||
    inclination > 90
  )
    throw new Error("Enter a finite azimuth and an inclination from 0 to 90°.");
}
export function line(trend: number, plunge: number): Vec {
  validateOrientation(trend, plunge);
  const t = wrap(trend) * rad,
    p = plunge * rad;
  return [Math.cos(p) * Math.sin(t), Math.cos(p) * Math.cos(t), Math.sin(p)];
}
export function orientation(vector: Vec) {
  const v = lower(vector);
  return {
    trend:
      Math.hypot(v[0], v[1]) < 1e-10 ? 0 : wrap(Math.atan2(v[0], v[1]) / rad),
    plunge: Math.asin(Math.min(1, v[2])) / rad,
  };
}
export function pole(strike: number, dip: number): Vec {
  return line(strike - 90, 90 - dip);
}
export function planeFromPole(vector: Vec) {
  const p = orientation(vector);
  return { strike: wrap(p.trend + 90), dip: 90 - p.plunge };
}
/** Radius normalized to one. SVG y increases downwards. */
export function project(
  vector: Vec,
  projection: Projection = "equal-area",
): [number, number] {
  const v = lower(vector),
    h = Math.hypot(v[0], v[1]);
  if (h < 1e-12) return [0, 0];
  const radius =
    projection === "equal-area"
      ? Math.sqrt(Math.max(0, 1 - v[2]))
      : Math.sqrt((1 - v[2]) / (1 + v[2]));
  return [(radius * v[0]) / h, (-radius * v[1]) / h];
}
/** Exact spherical plane basis; sample only its lower semicircle. */
export function greatCircle(strike: number, dip: number): Vec[] {
  validateOrientation(strike, dip);
  const a = line(strike, 0),
    b = line(strike + 90, dip);
  const extent = dip === 0 ? 360 : 180;
  return Array.from(
    { length: extent + 1 },
    (_, i) =>
      a.map((v, k) => v * Math.cos(i * rad) + b[k] * Math.sin(i * rad)) as Vec,
  );
}
/** Schmidt net small circles: constant angle from the horizontal north axis. */
export function smallCircle(angle: number): Vec[] {
  return Array.from(
    { length: 181 },
    (_, i) =>
      [
        Math.sin(angle * rad) * Math.cos(i * rad),
        Math.cos(angle * rad),
        Math.sin(angle * rad) * Math.sin(i * rad),
      ] as Vec,
  );
}
export function intersection(a: Vec, b: Vec) {
  return orientation(cross(a, b));
}
/** Jacobi diagonalization of symmetric 3x3 orientation tensor (axial data). */
export function eigenOrientations(vectors: Vec[]) {
  if (vectors.length < 3)
    throw new Error("Select at least three orientations.");
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const vector of vectors) {
    const v = unit(vector);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        matrix[i][j] += (v[i] * v[j]) / vectors.length;
  }
  const basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iteration = 0; iteration < 50; iteration++) {
    let p = 0,
      q = 1;
    for (const [i, j] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(matrix[i][j]) > Math.abs(matrix[p][q])) {
        p = i;
        q = j;
      }
    if (Math.abs(matrix[p][q]) < 1e-12) break;
    const theta =
      0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const c = Math.cos(theta),
      s = Math.sin(theta),
      pp = matrix[p][p],
      qq = matrix[q][q],
      pq = matrix[p][q];
    for (let k = 0; k < 3; k++)
      if (k !== p && k !== q) {
        const kp = matrix[k][p],
          kq = matrix[k][q];
        matrix[k][p] = matrix[p][k] = c * kp - s * kq;
        matrix[k][q] = matrix[q][k] = s * kp + c * kq;
      }
    matrix[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    matrix[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    matrix[p][q] = matrix[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      const kp = basis[k][p],
        kq = basis[k][q];
      basis[k][p] = c * kp - s * kq;
      basis[k][q] = s * kp + c * kq;
    }
  }
  return [0, 1, 2]
    .map((i) => ({
      value: matrix[i][i],
      vector: lower([basis[0][i], basis[1][i], basis[2][i]]),
    }))
    .sort((a, b) => b.value - a.value);
}
export function axialMean(vectors: Vec[]) {
  const e = eigenOrientations(vectors);
  if (e[0].value - e[1].value < 0.05)
    throw new Error(
      "No well-separated mean axis; the orientations are dispersed or girdled.",
    );
  return {
    ...orientation(e[0].vector),
    vector: e[0].vector,
    eigenvalues: e.map((x) => x.value),
  };
}
export function girdle(vectors: Vec[]) {
  const e = eigenOrientations(vectors);
  if (e[1].value - e[2].value < 0.05)
    throw new Error(
      "No well-separated girdle pole; more varied bedding orientations are needed.",
    );
  return {
    ...orientation(e[2].vector),
    ...planeFromPole(e[2].vector),
    eigenvalues: e.map((x) => x.value),
  };
}
export function directionalMean(vectors: Vec[]) {
  if (vectors.length < 2) throw new Error("Select at least two lines.");
  const sum = vectors.reduce<Vec>(
    (a, v) => a.map((x, i) => x + v[i]) as Vec,
    [0, 0, 0],
  );
  if (Math.hypot(...sum) / vectors.length < 0.1)
    throw new Error(
      "The directional resultant is too small for a reliable mean.",
    );
  return orientation(sum);
}
