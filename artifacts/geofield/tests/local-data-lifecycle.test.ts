import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalDataset, markLocalDatasetSynced, updateLocalDataset, deleteLocalDataset, getLocalDatasets, getPendingLocalDatasets, reconcileLocalDatasets } from "../src/lib/local-datasets.ts";
import { saveMeasurements, loadMeasurements, deleteMeasurement, restoreMeasurement } from "../src/lib/strike-dip-measurements.ts";
import { getLocalDeletedItems } from "../src/lib/recently-deleted.ts";
function setup() {
 const values=new Map<string,string>();
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 Object.defineProperty(globalThis,"window",{configurable:true,value:{dispatchEvent:()=>true}});
}
test("dataset edits made during creation remain pending after cloud acknowledgment", () => {
 setup();const folder=createLocalDataset({name:"Original"});updateLocalDataset(folder.id,{name:"Edited during sync"});
 markLocalDatasetSynced(folder.id,"cloud",folder.localRevision);
 assert.equal(getPendingLocalDatasets()[0].name,"Edited during sync");
});
test("dataset deletion is durable, preserves measurements, and remains pending until acknowledged", () => {
 setup();const folder=createLocalDataset({name:"Dataset"});markLocalDatasetSynced(folder.id,"cloud",folder.localRevision);
 saveMeasurements([{id:"measurement",datasetId:"cloud",label:"Keep",strike:"30",dip:"20"} as any]);
 deleteLocalDataset(folder.id);assert.equal(getLocalDatasets().length,0);assert.equal(getPendingLocalDatasets().length,1);assert.equal(loadMeasurements()[0].datasetId,null);
 const deletion=getPendingLocalDatasets()[0];markLocalDatasetSynced(deletion.id,"cloud",deletion.localRevision);assert.equal(getPendingLocalDatasets().length,0);
});
test("cloud dataset deletion hides its local mirror without deleting samples or measurements", () => {
 setup();const folder=createLocalDataset({name:"Dataset"});markLocalDatasetSynced(folder.id,"cloud",folder.localRevision);
 reconcileLocalDatasets([{id:"cloud",name:"Dataset",deletedAt:"2026-09-18T12:00:00Z"}]);assert.equal(getLocalDatasets().length,0);assert.equal(getLocalDatasets(true).length,1);
});
test("measurement deletion keeps a sync tombstone and restoration keeps the photo", () => {
 setup();saveMeasurements([{id:"m",label:"Outcrop",strike:"10",dip:"20",photo:"local-photo"} as any]);
 deleteMeasurement("m");assert.equal(loadMeasurements().length,0);assert.ok(loadMeasurements(true)[0].deletedAt);
 restoreMeasurement(getLocalDeletedItems()[0]);assert.equal(loadMeasurements()[0].photo,"local-photo");assert.equal(loadMeasurements()[0].deletedAt,null);
});

test("sample links recover if storage failed between dataset acknowledgment and relinking", async () => {
 setup();const { enqueue, getQueue, reconcileQueuedDatasetIds }=await import("../src/lib/offline-queue.ts");
 enqueue({sampleType:"rock",sampleId:"A",folderId:-123,fields:{}});
 reconcileQueuedDatasetIds([{id:-123,cloudId:"cloud-dataset"}]);assert.equal(getQueue()[0].payload.folderId,"cloud-dataset");
});
test("datasets created in the same millisecond receive distinct local IDs", () => {
 setup();const original=Date.now;Date.now=()=>123;
 try { const first=createLocalDataset({name:"One"});const second=createLocalDataset({name:"Two"});assert.notEqual(first.id,second.id);assert.equal(getLocalDatasets().length,2); }
 finally { Date.now=original; }
});
test("measurements deleted by older app versions acquire tombstones instead of reappearing", async () => {
 setup();const {archiveLocalItem}=await import("../src/lib/recently-deleted.ts");
 archiveLocalItem("measurement","Old deletion",{id:"old",strike:"10",dip:"20",photo:"retained"});
 assert.deepEqual(loadMeasurements(),[]);const all=loadMeasurements(true);assert.equal(all.length,1);assert.ok(all[0].deletedAt);assert.ok(all[0].localRevision);assert.equal(all[0].photo,"retained");
 assert.equal(loadMeasurements(true)[0].localRevision,all[0].localRevision);
});
test("older cloud-linked dataset deletions remain pending instead of silently reappearing", async () => {
 setup();const {archiveLocalItem}=await import("../src/lib/recently-deleted.ts");
 archiveLocalItem("dataset","Old dataset",{id:-1,cloudId:"cloud",name:"Old dataset",isLocal:true,createdAt:"2026-09-01T00:00:00Z"});
 assert.deepEqual(getLocalDatasets(),[]);assert.equal(getPendingLocalDatasets().length,1);assert.ok(getPendingLocalDatasets()[0].deletedAt);
});
