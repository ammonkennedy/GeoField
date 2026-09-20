import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheCloudSamples, getCachedCloudSamples } from "../src/lib/cloud-samples.ts";

test("stale cloud listings cannot erase acknowledged uploads; explicit tombstones remove them", () => {
 const data=new Map<string,string>();
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{ getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
 Object.defineProperty(globalThis,"window",{configurable:true,value:{dispatchEvent:()=>true}});
 const sample:any={id:"new",updatedAt:"2026-09-18T12:00:00Z",fields:{media:[{storageKey:"media/photo"}]}};
 cacheCloudSamples([sample]);cacheCloudSamples([]);assert.equal(getCachedCloudSamples().length,1);
 cacheCloudSamples([{...sample,updatedAt:"2026-09-18T12:01:00Z",deletedAt:"2026-09-18T12:01:00Z"}]);assert.deepEqual(getCachedCloudSamples(),[]);
 cacheCloudSamples([sample]);assert.deepEqual(getCachedCloudSamples(),[]);
});
test("display merges retain cached uploads missing from a list and prefer pending local edits", async () => {
 const {mergeCloudAndLocal}=await import("../src/lib/cloud-samples.ts");
 const cached:any={id:"one",updatedAt:"2026-09-18T12:00:00Z",notes:"Saved"};
 assert.deepEqual(mergeCloudAndLocal([], [cached]),[cached]);
 const pending={...cached,notes:"Offline edit",isOffline:true};
 assert.deepEqual(mergeCloudAndLocal([cached],[pending]),[pending]);
});
