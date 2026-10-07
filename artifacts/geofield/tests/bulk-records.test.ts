import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyBulkRecord } from '../src/lib/bulk-records.ts';
import { enqueue, getQueue, updateQueuedSample } from '../src/lib/offline-queue.ts';
import { loadMeasurements, saveMeasurements } from '../src/lib/strike-dip-measurements.ts';
import { getLocalDeletedItems } from '../src/lib/recently-deleted.ts';
function setup() {
 const values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>true}});
}
test('bulk moving a queued sample preserves the latest edits and attachments',()=>{
 setup();const sample=enqueue({sampleType:'rock',sampleId:'A',folderId:null,fields:{media:[{storageKey:'photo'}],notes:'old'}});
 updateQueuedSample(sample.queuedId,{...sample.payload,fields:{...sample.payload.fields,notes:'new'}});
 applyBulkRecord({key:'s',kind:'sample',id:sample.queuedId,name:'A',sample:sample.payload},'move','dataset');
 assert.equal(getQueue()[0].payload.folderId,'dataset');assert.equal(getQueue()[0].payload.fields.notes,'new');assert.deepEqual(getQueue()[0].payload.fields.media,[{storageKey:'photo'}]);
});
test('bulk deletion preserves recovery copies and queues sample and measurement tombstones',()=>{
 setup();const sample=enqueue({sampleType:'rock',sampleId:'A',folderId:null,fields:{}});
 saveMeasurements([{id:'m',label:'M',strike:'20',dip:'30',photoLocalKey:'photo'} as any]);
 applyBulkRecord({key:'m',kind:'measurement',id:'m',name:'M'},'move','dataset');
 assert.equal(loadMeasurements()[0].photoLocalKey,'photo');
 applyBulkRecord({key:'s',kind:'sample',id:sample.queuedId,name:'A'},'delete',null);
 applyBulkRecord({key:'m',kind:'measurement',id:'m',name:'M'},'delete',null);
 assert.equal(getQueue().length,0);assert.ok(getQueue(true)[0].deletedAt);
 assert.equal(loadMeasurements().length,0);assert.ok(loadMeasurements(true)[0].deletedAt);
 assert.equal(getLocalDeletedItems().length,2);
});
