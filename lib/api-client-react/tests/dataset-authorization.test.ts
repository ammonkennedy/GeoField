import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateDatasetWithAuthorization, deleteDatasetWithAuthorization } from '../src/dataset-authorization.ts';
import { captureAccountAuthorization } from '../src/account-authorization.ts';
const rejection = { data: null, errors: [{ errorType: 'Unauthorized', message: 'Not Authorized to access updateDataset on type Mutation' }] };
test('refreshes once and accepts confirmed dataset update', async () => {
 const calls: boolean[] = [];
 const result = await updateDatasetWithAuthorization(async refresh => { calls.push(refresh); return refresh ? { data: { id: 'one' } } : rejection; }, 'Field trip');
 assert.deepEqual(calls, [false, true]); assert.deepEqual(result.data, { id: 'one' });
});
test('persistent denial has actionable feedback and no endless retry', async () => {
 let calls = 0;
 await assert.rejects(updateDatasetWithAuthorization(async () => { calls++; return rejection; }, 'Field trip'), /pending changes remain/);
 assert.equal(calls, 2);
});
test('network failures and empty confirmations are not silently retried or accepted', async () => {
 let calls = 0;
 await assert.rejects(updateDatasetWithAuthorization(async () => { calls++; throw new Error('network failed'); }, 'Trip'), /network failed/);
 assert.equal(calls, 1);
 await assert.rejects(updateDatasetWithAuthorization(async () => ({ data: null }), 'Trip'), /did not confirm/);
});
test('account switch during refresh never submits the queued update as the other account', async () => {
 let writes = 0;
 await assert.rejects(updateDatasetWithAuthorization(async refresh => {
  await captureAccountAuthorization('original', async () => ({ tokens: { accessToken: { payload: { sub: refresh ? 'other' : 'original' }, toString: () => 'fixture' } } }), async () => false);
  writes++; return rejection;
 }, 'Trip'), /Account changed/);
 assert.equal(writes, 1);
});

test('denied project deletion and restoration identify the operation without blaming sample deletion', async () => {
 for (const operation of ['delete', 'restore'] as const) {
  await assert.rejects(updateDatasetWithAuthorization(async () => rejection, 'project-id', operation), error => {
   assert.equal((error as Error).name, 'DatasetAccessDenied');
   assert.match((error as Error).message, new RegExp(`could not ${operation} project project-id`));
   assert.match((error as Error).message, /does not confirm that a sample deletion failed/);
   return true;
  });
 }
});

test('deleting a missing cloud project finishes only after authenticated absence confirmation', async () => {
 const calls: string[] = [];
 await deleteDatasetWithAuthorization(async refresh => {calls.push(`update:${refresh}`);return rejection;}, 'missing', async () => {calls.push('read');return {data:null};});
 assert.deepEqual(calls, ['update:false','update:true','read']);
});
test('existing inaccessible, active, partial, or malformed reads never discard pending project deletion', async () => {
 for (const response of [rejection, {data:null,errors:[{message:'Read failed'}]}, {data:{id:'existing'}}, {}, {data:undefined}]) {
  await assert.rejects(deleteDatasetWithAuthorization(async () => rejection, 'project', async () => response), {name:'DatasetAccessDenied'});
 }
});
test('network failures and account switches during absence confirmation retain pending deletion', async () => {
 for (const reason of ['Network unavailable', 'Account changed']) {
  await assert.rejects(deleteDatasetWithAuthorization(async () => rejection, 'project', async () => {throw Error(reason);}), new RegExp(reason));
 }
});
test('successful deletion requires no follow-up read and uncertain mutation failures cannot be accepted', async () => {
 let reads=0;
 const read=async()=>{reads++;return {data:null};};
 await deleteDatasetWithAuthorization(async()=>({data:{id:'project',deletedAt:'now'}}),'project',read);
 assert.equal(reads,0);
 await assert.rejects(deleteDatasetWithAuthorization(async()=>{throw Error('network');},'project',read),/network/);
 await assert.rejects(deleteDatasetWithAuthorization(async()=>({data:null}),'project',read),/did not confirm/);
 assert.equal(reads,0);
});
