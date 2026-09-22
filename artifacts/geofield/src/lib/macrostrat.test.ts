import test from "node:test";
import assert from "node:assert/strict";
import { macrostratSourceQueryUrl, macrostratUnitQueryUrl } from "./macrostrat-config.ts";
import { renderedMacrostratUnit, ensureMacrostratLayer, setMacrostratVisibility } from "./macrostrat-layer.ts";
import { clearMacrostratSourceCache, parseMacrostratSelection, queryMacrostratGeology } from "./macrostrat-service.ts";

test("coordinate query sends latitude as lat and longitude as lng", () => {
  const url = new URL(macrostratUnitQueryUrl(35.5, -78.75));
  assert.equal(url.searchParams.get("lat"), "35.5");
  assert.equal(url.searchParams.get("lng"), "-78.75");
  assert.equal(url.searchParams.get("response"), "long");
});

test("source URL construction preserves source id", () => {
  assert.equal(new URL(macrostratSourceQueryUrl(42)).searchParams.get("source_id"), "42");
});

test("parser preserves selected unit identity instead of preferring richer descriptions", () => {
  const selection = parseMacrostratSelection({ success: { data: [
    { name: "Generic unit" },
    { name: "Raleigh Gneiss", source_id: 12, strat_name: "Raleigh", lith: "gneiss", descrip: "Metamorphic rock", t_int_name: "Neoproterozoic", color: "aabbcc" },
  ], refs: { "12": "State Geological Survey" } } });
  assert.equal(selection?.displayName, "Generic unit");
  assert.equal(selection?.lithology, undefined);
  assert.equal(selection?.age, undefined);
  assert.equal(selection?.source, undefined);
  assert.equal(parseMacrostratSelection({ success: { data: [] } }), null);
  assert.equal(parseMacrostratSelection({}), null);
});

test("layer creation is idempotent and visibility can be toggled", () => {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, any>();
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, source: unknown) => sources.set(id, source),
    getLayer: (id: string) => layers.get(id),
    addLayer: (layer: any) => layers.set(layer.id, layer),
    setPaintProperty: () => undefined,
    setLayoutProperty: (id: string, key: string, value: string) => { layers.get(id).layout[key] = value; },
  };
  ensureMacrostratLayer(map, 0.65);
  ensureMacrostratLayer(map, 0.5);
  assert.equal(sources.size, 1);
  assert.equal(layers.size, 2);
  setMacrostratVisibility(map, false);
  assert.equal(layers.get("geology-overlay").layout.visibility, "none");
});

test("source references are cached during the session", async () => {
  clearMacrostratSourceCache();
  const originalFetch = globalThis.fetch;
  let sourceRequests = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/defs/sources")) {
      sourceRequests++;
      return new Response(JSON.stringify({ success: { data: [{ ref: "Example Survey" }] } }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: { data: [{ name: "Unit", source_id: 7 }] } }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal((await queryMacrostratGeology(1, 2))?.source, "Example Survey");
    assert.equal((await queryMacrostratGeology(3, 4))?.source, "Example Survey");
    assert.equal(sourceRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearMacrostratSourceCache();
  }
});

test("network errors propagate without producing fabricated geology", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(queryMacrostratGeology(1, 2), /503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an aborted rapid-tap request cannot complete", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const controller = new AbortController();
  const request = queryMacrostratGeology(1, 2, controller.signal);
  controller.abort();
  try {
    await assert.rejects(request, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("hit testing selects the top rendered polygon at the exact point", () => {
  const point = { x: 120, y: 230 };
  const selected = { map_id: 1, color: "00ff00", name: "Green unit" };
  const map = {
    getLayer: () => true,
    queryRenderedFeatures: (position: unknown, options: unknown) => {
      assert.deepEqual(position, [point.x, point.y]);
      assert.deepEqual(options, { layers: ["geology-overlay"] });
      return [{ properties: selected }, { properties: { map_id: 2, color: "ff00ff", descrip: "Richer but hidden unit" } }];
    },
  };
  assert.equal(renderedMacrostratUnit(map, point), selected);
  assert.equal(renderedMacrostratUnit({ getLayer: () => false }, point), null);
  assert.equal(renderedMacrostratUnit({ getLayer: () => true, queryRenderedFeatures: () => [] }, point), null);
});
