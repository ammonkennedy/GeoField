import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDetailedTrails, trailSegmentDetails } from "../src/lib/detailed-trails.ts";
import { showDetailedTrailPopup } from "../src/lib/detailed-trail-overlay.ts";

function feature(id = 1, extra = {}) {
  return { type: "Feature", id, properties: { name: "Red Rocks Park", lengthmiles: 0.15698657, ...extra }, geometry: { type: "LineString", coordinates: [[0, 0], [100, 0]] } };
}
test("small local trails include name and segment distance, without presenting network distance as hike length", () => {
  const info = trailSegmentDetails({ name: "Red Rocks Park", lengthmiles: 0.15698657, networklength: 3.10430555 });
  assert.equal(info.name, "Red Rocks Park");
  assert.equal(info.distance, "0.25 km (0.16 mi)");
  assert.equal(trailSegmentDetails({}).distance, "Distance unavailable");
});
test("viewport query fetches all pages and excludes water/non-hiking trails", async () => {
  const original = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(new URL(String(url)));
    return Response.json(urls.length === 1
      ? { features: [feature(), feature(2, { trailtype: "Water Trail" }), feature(3, { hikerpedestrian: "No" })], exceededTransferLimit: true }
      : { features: [feature(4)] });
  }) as typeof fetch;
  try {
    const result = await loadDetailedTrails([-73.25, 44.4, -73.15, 44.55], new AbortController().signal);
    assert.deepEqual(result.data.features.map((item) => item.id), [1, 4]);
    assert.equal(result.limited, false);
    assert.equal(urls[0].searchParams.get("inSR"), "4326");
    assert.equal(urls[0].searchParams.get("geometry"), "-73.25,44.4,-73.15,44.55");
    assert.equal(urls[1].searchParams.get("resultOffset"), "1000");
  } finally { globalThis.fetch = original; }
});
test("service errors are reported instead of displaying empty coverage", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: { message: "Unavailable" } })) as typeof fetch;
  try { await assert.rejects(loadDetailedTrails([-74,44,-73,45], new AbortController().signal), /unavailable/); }
  finally { globalThis.fetch = original; }
});
test("clicking a visible line opens its loaded details without a network request", () => {
  const original = globalThis.document;
  let popupContent: any;
  const node = () => ({ textContent: "", style: {}, children: [] as any[], append(...children: any[]) { this.children.push(...children); } });
  globalThis.document = { createElement: node } as any;
  class Popup {
    setLngLat() { return this; }
    setDOMContent(content: any) { popupContent = content; return this; }
    addTo() { return this; }
    remove() {}
  }
  const map = { getLayer: () => true, queryRenderedFeatures: () => [feature()], project: ([x,y]: number[]) => ({ x, y }) };
  try {
    assert.equal(showDetailedTrailPopup(map as any, { x: 50, y: 12 }, [0,0], Popup as any), true);
    assert.equal(popupContent.children[0].textContent, "Red Rocks Park");
    assert.match(popupContent.children[1].textContent, /Mapped segment: 0.25 km/);
    assert.equal(showDetailedTrailPopup(map as any, { x: 50, y: 30 }, [0,0], Popup as any), false);
  } finally { globalThis.document = original; }
});
