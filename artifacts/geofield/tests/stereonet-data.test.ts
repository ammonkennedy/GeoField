import test from "node:test";
import assert from "node:assert/strict";
import {
  newStereonet,
  importMeasurement,
  normalizedMeasurement,
} from "../src/lib/stereonet/model.ts";
import {
  syncNetRecords,
  validateSnapshot,
  type NetSnapshot,
} from "../src/lib/stereonet/sync.ts";
import type { Stereonet } from "../src/lib/stereonet/model.ts";
import type { StrikeDipMeasurement } from "../src/lib/strike-dip-measurements.ts";
const original = {
  id: "m",
  label: "Bedding",
  measurementType: "plane",
  strike: "0",
  dip: "30",
  dipDirectionDegrees: 90,
  featureType: "bedding",
  notes: "Original",
  northReference: "magnetic",
  magneticDeclination: 12,
  latitude: 40,
  longitude: -110,
  date: "2026-10-22",
  location: "40,-110",
  rockLayerType: "",
  dipDir: "E",
} as StrikeDipMeasurement;
test("import normalizes RHR while preserving original reference and metadata", () => {
  const n = newStereonet("Test"),
    m = importMeasurement(original, n.groups[0].id);
  assert.equal(m.azimuth, 0);
  assert.equal(m.inclination, 30);
  assert.equal(m.raw.latitude, 40);
  const p = normalizedMeasurement(m, n.groups[0], "true");
  assert.equal(p.azimuth, 12);
  assert.equal(m.azimuth, 0);
  assert.equal(m.north, "magnetic");
});
test("conversion requires known reference and explicit declination", () => {
  const n = newStereonet("Test"),
    m = importMeasurement(
      {
        ...original,
        northReference: undefined,
        magneticDeclination: undefined,
      },
      n.groups[0].id,
    );
  assert.throws(
    () => normalizedMeasurement(m, n.groups[0], "true"),
    /assumed north/,
  );
  assert.throws(
    () =>
      normalizedMeasurement(
        m,
        { ...n.groups[0], assumedNorth: "magnetic" },
        "true",
      ),
    /declination/,
  );
  assert.equal(
    normalizedMeasurement(
      m,
      { ...n.groups[0], assumedNorth: "magnetic", declination: -15 },
      "true",
    ).azimuth,
    345,
  );
});
test("imports reject ambiguous quadrant strings and incomplete lineations", () => {
  assert.throws(() =>
    importMeasurement(
      { ...original, strike: "N30E", dipDirectionDegrees: undefined },
      "g",
    ),
  );
  assert.throws(() =>
    importMeasurement({ ...original, measurementType: "lineation" }, "g"),
  );
});
function setup() {
  let data: Stereonet[] = [{ ...newStereonet("Net"), localRevision: "one" }];
  const cloud = new Map<string, NetSnapshot>();
  const store = {
    load: () => structuredClone(data),
    save: (n: Stereonet[]) => {
      data = structuredClone(n);
    },
    put: async (s: NetSnapshot) => {
      cloud.set(s.revision, JSON.parse(JSON.stringify(s)));
    },
    get: async (s: NetSnapshot) => structuredClone(cloud.get(s.revision)),
    list: async () => {
      const parents = new Set([...cloud.values()].map((s) => s.parent));
      return [...cloud.values()].filter((s) => !parents.has(s.revision));
    },
  };
  return { store, cloud, data: () => data };
}
test("confirmed upload and download preserve all stereonet content", async () => {
  const a = setup();
  await syncNetRecords(a.store);
  assert.equal(a.data()[0].localRevision, undefined);
  const b = setup();
  b.store.save([]);
  b.store.list = a.store.list;
  await syncNetRecords(b.store);
  assert.deepEqual(a.data(), b.data());
});
test("failed uploads and false confirmation preserve pending edits", async () => {
  const a = setup();
  a.store.put = async () => {
    throw Error("offline");
  };
  await assert.rejects(syncNetRecords(a.store));
  assert.equal(a.data()[0].localRevision, "one");
  const b = setup();
  const get = b.store.get;
  b.store.get = async (s) =>
    ({
      ...(await get(s)),
      net: { ...b.data()[0], name: "wrong" },
    }) as NetSnapshot;
  await assert.rejects(syncNetRecords(b.store));
  assert.equal(b.data()[0].localRevision, "one");
});
test("edit during upload remains queued", async () => {
  const a = setup(),
    put = a.store.put;
  a.store.put = async (s) => {
    await put(s);
    a.store.save([{ ...a.data()[0], name: "new", localRevision: "two" }]);
  };
  await syncNetRecords(a.store);
  assert.equal(a.data()[0].localRevision, "two");
  assert.equal(a.data()[0].cloudRevision, "one");
});
test("concurrent device branches are preserved without duplicate copies on retry", async () => {
  const a = setup(),
    n = a.data()[0];
  a.store.save([]);
  a.store.list = async () =>
    ["left", "right"].map((revision) => ({
      schema: 1,
      revision,
      net: { ...n, name: revision, localRevision: undefined },
    }));
  await syncNetRecords(a.store);
  assert.equal(a.data().length, 2);
  await syncNetRecords(a.store);
  assert.equal(a.data().length, 2);
});
test("deletion tombstones suppress stale cloud copies", async () => {
  const a = setup(),
    n = a.data()[0];
  a.store.save([
    { ...n, deletedAt: new Date().toISOString(), localRevision: undefined },
  ]);
  a.store.list = async () => [{ schema: 1, revision: "old", net: n }];
  await syncNetRecords(a.store);
  assert.equal(a.data().length, 1);
  assert.ok(a.data()[0].deletedAt);
});
test("malformed cloud payloads cannot overwrite good local data", () => {
  const n = newStereonet("Test");
  assert.throws(() =>
    validateSnapshot({
      schema: 1,
      revision: "x",
      net: { ...n, groups: [{ ...n.groups[0], color: "url(evil)" }] },
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      schema: 1,
      revision: "x",
      net: { ...n, measurements: [{ azimuth: NaN }] },
    }),
  );
});
