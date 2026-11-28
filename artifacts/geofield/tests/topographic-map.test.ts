import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topographicMapConfig} from '../src/lib/topographic-map.ts';
import {TRIP_MAP_STYLE} from '../src/lib/trip-map-style.ts';
import {applyBaseMap} from '../src/lib/base-map.ts';
test('worldwide topo is a direct online raster source with required attribution',()=>{
  const config=topographicMapConfig('test-key');
  assert.equal(config.label,'World Topo');assert.equal(config.onlineOnly,true);
  assert.equal(config.source.tiles[0],'https://api.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=test-key');
  assert.match(config.source.attribution,/https:\/\/www.thunderforest.com/);
  assert.match(config.source.attribution,/https:\/\/www.openstreetmap.org\/copyright/);
  assert.equal(config.cameraMaxZoom,config.source.maxzoom-1);
});
test('no key preserves working USGS source without unauthorized provider requests',()=>{
  const config=topographicMapConfig('  ');
  assert.equal(config.label,'USGS Topo');
  assert.match(config.source.tiles[0],/nationalmap.gov/);
  assert.deepEqual(TRIP_MAP_STYLE.sources.topographic,config.source);
});
test('switching topographic source preserves overlay layers and hides duplicate labels',()=>{
  const calls:any[]=[];
  applyBaseMap({setMaxZoom:(z:number)=>calls.push(z),getLayer:()=>true,setLayoutProperty:(...args:any[])=>calls.push(args)} as any,'topographic');
  assert.deepEqual(calls,[15,['satellite-layer','visibility','none'],['street-layer','visibility','none'],['topographic-layer','visibility','visible'],['labels','visibility','none']]);
});
test('geology offline cache rejects Thunderforest URLs before downloading',async()=>{
  const {loadGeologyTile}=await import('../src/lib/geology-tile-cache.ts');
  await assert.rejects(loadGeologyTile('https://api.thunderforest.com/outdoors/1/1/1.png?apikey=test',new AbortController().signal));
});
