import assert from "node:assert/strict";
import { test } from "node:test";
import { syncQueuedSample } from "../src/lib/sync-sample-queue.ts";
const initial = { queuedId: "q_fixed", queuedAt: "today", payload: { sampleType: "rock", sampleId: "Rock", folderId: null, fields: { notes: "original" } } };
function setup() {
 let queue = [structuredClone(initial)]; const cache:any[] = []; const ids:string[] = [];
 const store = {
  load: () => queue, prepare: async (item:any) => item.payload,
  create: async (id:string, payload:any) => { ids.push(id); return {id,...payload}; },
  update: async (id:string, payload:any) => ({id,...payload}), get: async (id:string) => ({id,...initial.payload}),
  cache: (saved:any) => {cache.push(saved);}, remove: () => { queue=[]; },
 };
 return {store, cache, ids, queue:()=>queue};
}
test("a lost create response retries the same cloud ID and caches before acknowledgment", async () => {
 const s=setup(); s.store.create=async(id)=>{s.ids.push(id);throw new Error("network");};
 await syncQueuedSample(initial,s.store); assert.deepEqual(s.ids,["q_fixed"]); assert.equal(s.cache[0].id,"q_fixed"); assert.equal(s.queue().length,0);
});
test("editing during upload leaves the newer sample pending", async () => {
 const s=setup(); s.store.create=async(id)=>{s.queue()[0].payload.fields.notes="new edit";return {id,...initial.payload};};
 const pending=await syncQueuedSample(initial,s.store); assert.equal(pending,true);assert.equal(s.queue()[0].payload.fields.notes,"new edit");
});
test("failed local cache write must not discard the pending sample", async () => {
 const s=setup();s.store.cache=()=>{throw new Error("storage full");};
 await assert.rejects(syncQueuedSample(initial,s.store),/storage full/);assert.equal(s.queue().length,1);
});
test("failed attachment upload does not send incomplete sample data", async () => {
 const s=setup();s.store.prepare=async()=>{throw new Error("photo unavailable");};
 await assert.rejects(syncQueuedSample(initial,s.store),/photo unavailable/);assert.equal(s.ids.length,0);assert.equal(s.queue().length,1);
});
test("an offline edit conflicting with another device is saved as a separate recovery copy", async () => {
 const s=setup();const item={...initial,targetId:"cloud-original",baseUpdatedAt:"older"};
 s.store.get=async(id)=>({id,updatedAt:"newer",notes:"Other device"});
 let overwrote=false; s.store.update=async()=>{overwrote=true;return {};};
 await syncQueuedSample(item,s.store);assert.equal(overwrote,false);assert.equal(s.cache[0].id,"q_fixed");assert.match(s.cache[0].sampleId,/recovered edit/);
});
test("a deletion is not acknowledged until the cloud tombstone succeeds", async () => {
 const s=setup(); const item={...initial,deletedAt:"2026-09-18T12:00:00Z"};
 await assert.rejects(syncQueuedSample(item,{...s.store,delete:async()=>{throw new Error("offline");}}),/offline/);
 assert.equal(s.queue().length,1);assert.equal(s.cache.length,0);
});
test("incomplete cloud acknowledgment never removes the full local sample", async () => {
 const s=setup(); s.store.create=async(id)=>({id,...initial.payload,fields:{}});
 await assert.rejects(syncQueuedSample(initial,s.store),/all sample fields/);assert.equal(s.queue().length,1);
});
test("retry after a lost update response recognizes matching cloud content without making a conflict copy", async () => {
 const s=setup();const item={...initial,targetId:"original",baseUpdatedAt:"before"};
 s.store.get=async(id)=>({id,...initial.payload,updatedAt:"after"});
 s.store.update=async()=>{throw new Error("must not rewrite");};
 await syncQueuedSample(item,s.store);assert.equal(s.ids.length,0);assert.equal(s.cache[0].id,"original");
});
test("deleting an archived sample never overwrites newer cloud fields or attachments", async () => {
 const s=setup();const latest={id:"q_fixed",...initial.payload,notes:"Other device text",fields:{media:[{storageKey:"media/new-photo"}]},deletedAt:"now"};
 s.store.get=async()=>latest;s.store.update=async()=>{throw new Error("must not rewrite fields");};
 await syncQueuedSample({...initial,deletedAt:"now"},{...s.store,delete:async()=>latest});
 assert.equal(s.ids.length,0);assert.deepEqual(s.cache[0].fields,latest.fields);assert.equal(s.cache[0].notes,"Other device text");
});
test("restoring a sample retains changes made after the local trash snapshot", async () => {
 const s=setup();const latest={id:"q_fixed",...initial.payload,notes:"New cloud text",deletedAt:null};
 s.store.get=async()=>latest;s.store.update=async()=>{throw new Error("must not rewrite fields");};
 await syncQueuedSample({...initial,restore:true},{...s.store,restore:async()=>latest});assert.equal(s.cache[0].notes,"New cloud text");
});
test("a lost create response followed by another device edit creates a stable recovery copy", async () => {
 const s=setup();s.store.create=async(id,payload)=>{if(id==="q_fixed")throw new Error("already exists");s.ids.push(id);return {id,...payload};};
 s.store.get=async(id)=>({id,...initial.payload,notes:"Other device"});s.store.update=async()=>{throw new Error("must not overwrite original");};
 await syncQueuedSample(initial,s.store);assert.match(s.cache[0].id,/q_fixed-recovered-/);assert.match(s.cache[0].sampleId,/recovered edit/);
});
test("missing deletion acknowledgment keeps the operation pending", async () => {
 const s=setup();await assert.rejects(syncQueuedSample({...initial,deletedAt:"now"},{...s.store,delete:async()=>({id:"q_fixed",...initial.payload,deletedAt:null})}),/did not confirm/);assert.equal(s.queue().length,1);
});

test('a competing cloud edit at write time leaves local water data pending', async () => {
 const s = setup(); const item = { ...initial, targetId: 'cloud-water', baseUpdatedAt: 'before' };
 s.store.get = async id => ({ id, ...initial.payload, notes: 'prior values', updatedAt: 'before' });
 s.store.update = async (_id, _payload, revision?: string) => {
   assert.equal(revision, 'before'); throw new Error('ConditionalCheckFailedException');
 };
 await assert.rejects(syncQueuedSample(item, s.store), /ConditionalCheckFailed/);
 assert.equal(s.queue().length, 1); assert.equal(s.cache.length, 0);
});

test('120 offline water samples survive restart and lost cloud responses without duplicate IDs', async () => {
 const originals = Array.from({ length: 120 }, (_, i) => ({ queuedId: `ecuador-${i}`, queuedAt: '2026-11-11', payload: {
   sampleType: 'water', sampleId: `EC-${String(i).padStart(3, '0')}`, folderId: 'water-project', notes: 'Río — preserved locally',
   fields: { ph: i % 14, temperature: 0, do: '<0.01', conductivity: 12.3456789, latitude: -0.123456789, longitude: -78.456789012, collectionDate: '2026-11-11T10:00', customParams: [{ label: 'Bottle', value: '0001' }], media: [{ kind: 'photo', storageKey: `media/photo-${i}`, localKey: `local-${i}` }] },
 } }));
 let queue = JSON.parse(JSON.stringify(originals)); // reopened local storage
 const cloud = new Map<string, any>(); const cache = new Map<string, any>();
 const store = {
   load: () => queue, prepare: async (item: any) => item.payload,
   create: async (id: string, payload: any) => {
     if (cloud.has(id)) throw new Error('Already exists');
     cloud.set(id, { id, ...structuredClone(payload) });
     if (Number(id.split('-').at(-1)) % 3 === 0) throw new Error('Network Error');
     return cloud.get(id);
   },
   get: async (id: string) => cloud.get(id), update: async () => { throw new Error('Unexpected update'); },
   cache: (record: any) => { cache.set(record.id, structuredClone(record)); },
   remove: (id: string) => { queue = queue.filter((item: any) => item.queuedId !== id); },
 };
 for (const item of [...queue]) await syncQueuedSample(item, store);
 assert.equal(queue.length, 0); assert.equal(cloud.size, 120); assert.equal(cache.size, 120);
 for (const original of originals) assert.deepEqual(cache.get(original.queuedId).fields, original.payload.fields);
});

test('an edit during the first upload continues on the same sample ID instead of creating a recovery copy', async () => {
  let queue: any[] = [structuredClone(initial)];
  let cloud: any;
  let creates = 0, updates = 0;
  const store = {
    load: () => queue,
    prepare: async (item: any) => item.payload,
    create: async (id: string, payload: any) => {
      creates++;
      queue[0].payload.fields.media = [{ id: 'photo2', storageKey: 'local-photo2' }];
      cloud = { id, ...structuredClone(payload), updatedAt: 'first-upload' };
      return cloud;
    },
    get: async () => cloud,
    update: async (id: string, payload: any, revision?: string) => {
      assert.equal(revision, 'first-upload'); updates++;
      return { id, ...payload, updatedAt: 'second-upload' };
    },
    cache: () => {}, remove: () => { queue = []; },
    rebase: (current: any, saved: any) => { queue = [{ ...current, targetId: saved.id, baseUpdatedAt: saved.updatedAt }]; },
  };
  await syncQueuedSample(structuredClone(initial), store);
  assert.equal(queue[0].targetId, initial.queuedId);
  assert.equal(queue[0].payload.fields.media.length, 1);
  await syncQueuedSample(structuredClone(queue[0]), store);
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.equal(queue.length, 0);
});
test('deleting a never-uploaded sample does not require its local project or media upload', async () => {
 const item = { ...structuredClone(initial), deletedAt: '2026-11-24', payload: { ...structuredClone(initial.payload), folderId: -123 } };
 let current = [item]; let remote:any = null;
 const s=setup();
 await syncQueuedSample(item, { ...s.store,
  load: () => current,
  prepare: async () => { throw new Error('must not upload media for deletion'); },
  get: async () => { if (!remote) throw new Error('Sample not found'); return remote; },
  create: async (id, payload) => { assert.equal(payload.folderId, null); remote = {id, ...payload}; return remote; },
  delete: async () => { remote = {...remote, deletedAt: item.deletedAt}; return remote; },
  remove: () => { current = []; },
 });
 assert.equal(current.length, 0);
 assert.equal(s.cache[0].deletedAt, item.deletedAt);
 assert.equal(item.payload.folderId, -123);
 assert.deepEqual(item.payload.fields, initial.payload.fields);
});
