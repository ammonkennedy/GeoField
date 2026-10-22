import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateDatasetWithAuthorization } from '../src/dataset-authorization.ts';
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
