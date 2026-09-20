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
