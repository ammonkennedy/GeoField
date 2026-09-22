import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryCombinedGeology, queryUsgsGeology } from '../src/lib/combined-geology.ts';

test('USGS joins original and national descriptions and preserves boundary units', async () => {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); calls.push(url);
    const layer = Number(url.pathname.split('/').at(-2));
    const rows = layer === 6 ? [{ MapUnit: 'Q', Source_MapUnit: "a'b", DataSourceID: '1' }, { MapUnit: 'Q', Source_MapUnit: "a'b" }, { MapUnit: 'K', Source_MapUnit: 'k' }] : layer === 11 ? [{ Name: 'Original', DescriptionSourceID: '1' }] : layer === 8 ? [{ Name: 'Synthesis' }] : [{ Source: 'Map citation' }];
    return Response.json({ features: rows.map(attributes => ({ attributes })) });
  };
  try {
    const result = await queryUsgsGeology(40, -111, new AbortController().signal);
    assert.equal(result.length, 2);
    assert.equal(result[0].original?.Name, 'Original');
    assert.equal(result[0].synthesis?.Name, 'Synthesis');
    assert.equal(result[0].sources[0].Source, 'Map citation');
    assert.ok(calls.some(url => url.searchParams.get('where') === "Source_MapUnit='a''b'"));
    assert.equal(calls[0].searchParams.get('geometry'), '-111,40');
  } finally { globalThis.fetch = originalFetch; }
});

test('Macrostrat remains available if USGS returns an API error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => String(input).includes('FeatureServer') ? Response.json({ error: { message: 'Unavailable' } }) : Response.json({ success: { data: [{ name: 'Sandstone', lith: 'sandstone' }] } });
  try {
    const result = await queryCombinedGeology(40, -111);
    assert.equal(result.macrostrat?.displayName, 'Sandstone');
    assert.deepEqual(result.usgs, []);
    assert.equal(result.warnings.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('no coverage is distinct from a failed request and cancellation is propagated', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => String(input).includes('FeatureServer') ? Response.json({ features: [] }) : Response.json({ success: { data: [] } });
  try {
    assert.deepEqual(await queryCombinedGeology(0, 0), { macrostrat: null, usgs: [], warnings: [] });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(queryCombinedGeology(0, 0, controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});

test('USGS remains available if Macrostrat fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (!url.pathname.includes('FeatureServer')) throw new Error('Network unavailable');
    const layer = Number(url.pathname.split('/').at(-2));
    return Response.json({ features: (layer === 6 ? [{ MapUnit: 'Q' }] : [{ Name: 'Alluvium' }]).map(attributes => ({ attributes })) });
  };
  try {
    const result = await queryCombinedGeology(40, -111);
    assert.equal(result.usgs[0].synthesis?.Name, 'Alluvium');
    assert.equal(result.macrostrat, null);
    assert.match(result.warnings[0], /Macrostrat/);
  } finally { globalThis.fetch = originalFetch; }
});

test('rendered unit stays selected without a coordinate lookup even when USGS differs', async () => {
  const originalFetch = globalThis.fetch;
  const selected = { unit: { map_id: 123, name: 'Visible green unit', color: '00ff00' }, displayName: 'Visible green unit', color: '00ff00' };
  globalThis.fetch = async input => {
    assert.ok(String(input).includes('FeatureServer'), 'must not replace the visible polygon with a coordinate lookup');
    return Response.json({ features: [] });
  };
  try {
    const result = await queryCombinedGeology(40, -111, undefined, selected);
    assert.equal(result.macrostrat, selected);
    assert.equal((await queryCombinedGeology(40, -111, undefined, null)).macrostrat, null);
  } finally { globalThis.fetch = originalFetch; }
});
