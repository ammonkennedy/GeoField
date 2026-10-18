import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTrackRecords, type StoredTrack, type TrackSnapshot, validateTrackSnapshot } from '../src/lib/track-sync.ts';
const track = (patch: Partial<StoredTrack> = {}): StoredTrack => ({ id:'walk',name:'Walk',startedAt:'2026-10-15T10:00:00Z',stoppedAt:'2026-10-15T10:05:00Z',points:[],visible:true,localRevision:'rev1',...patch });
function setup(initial=[track()]) {
 let data=initial;const cloud=new Map<string,TrackSnapshot>();
 const store={load:()=>structuredClone(data),save:(next:StoredTrack[])=>{data=structuredClone(next);},activeId:():string|null=>null,
  put:async(s:TrackSnapshot)=>{cloud.set(s.revision,JSON.parse(JSON.stringify(s)));},get:async(s:TrackSnapshot)=>structuredClone(cloud.get(s.revision)!),
  list:async()=>{const parents=new Set([...cloud.values()].map(s=>s.parent));return [...cloud.values()].filter(s=>!parents.has(s.revision));}};
 return {store,cloud,data:()=>data};
}
test('confirmed snapshots clear only their matching local revision and download on another device',async()=>{const a=setup();await syncTrackRecords(a.store);assert.equal(a.data()[0].localRevision,undefined);assert.equal(a.data()[0].cloudRevision,'rev1');const b=setup([]);b.store.list=a.store.list;await syncTrackRecords(b.store);assert.equal(b.data()[0].name,'Walk');});
test('failed upload preserves pending track',async()=>{const a=setup();a.store.put=async()=>{throw Error('offline');};await assert.rejects(syncTrackRecords(a.store),/offline/);assert.equal(a.data()[0].localRevision,'rev1');});
test('false cloud confirmation never clears pending changes',async()=>{const a=setup();a.store.get=async s=>({...s,track:{...s.track,name:'Wrong'}});await assert.rejects(syncTrackRecords(a.store),/did not confirm/);assert.equal(a.data()[0].localRevision,'rev1');});
test('edit during upload stays pending and chains from confirmed snapshot',async()=>{const a=setup();const put=a.store.put;a.store.put=async s=>{await put(s);a.store.save([track({name:'New name',localRevision:'rev2'})]);};await syncTrackRecords(a.store);assert.equal(a.data()[0].localRevision,'rev2');assert.equal(a.data()[0].cloudRevision,'rev1');assert.equal(a.data()[0].name,'New name');});
test('recording track is not uploaded or replaced by cloud',async()=>{const a=setup();a.store.activeId=()=> 'walk';a.store.list=async()=>[{schema:1,revision:'remote',track:track({name:'Other'})}];await syncTrackRecords(a.store);assert.equal(a.cloud.size,0);assert.equal(a.data()[0].name,'Walk');assert.equal(a.data().length,2);});
test('simultaneous branches retain both versions',async()=>{const a=setup([]);a.store.list=async()=>['one','two'].map(revision=>({schema:1,revision,parent:'base',track:track({name:revision})}));await syncTrackRecords(a.store);assert.equal(a.data().length,2);assert.ok(a.data().some(t=>t.name.includes('other device copy')));await syncTrackRecords(a.store);assert.equal(a.data().length,2);});
test('download errors never remove local tracks',async()=>{const a=setup([track({localRevision:undefined,cloudRevision:'rev1'})]);a.store.list=async()=>{throw Error('download failed');};await assert.rejects(syncTrackRecords(a.store));assert.equal(a.data().length,1);});
test('malformed cloud data is rejected',()=>{assert.throws(()=>validateTrackSnapshot({schema:1,revision:'v',track:{...track(),points:[{latitude:999}]}}));});
