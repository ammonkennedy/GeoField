import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestWithCaptionFallback } from '../src/measurement-caption-request.ts';
const missing = { errors: [{ message: "Field 'photoCaption' in type 'StrikeDipMeasurement' is undefined" }] };
test('old backend still allows ordinary measurement reads without losing other fields', async () => {
 const calls: any[] = [];
 const result = await requestWithCaptionFallback(async request => { calls.push(request); return calls.length === 1 ? missing : { data:{ id:'one', strike:10 } }; }, { query:'query { id strike photoCaption }', variables:{} });
 assert.equal(calls.length,2); assert.match(calls[1].query,/strike/); assert.doesNotMatch(calls[1].query,/photoCaption/); assert.equal(result.data.strike,10);
});
test('old backend cannot silently acknowledge a label it did not store', async () => {
 let calls=0;
 await assert.rejects(requestWithCaptionFallback(async () => { calls++; throw missing; }, { query:'mutation { photoCaption }', variables:{input:{id:'one',photoCaption:'Limestone'}} }), /remain saved/);
 assert.equal(calls,1);
});
test('network errors never cause a caption to be stripped', async () => {
 let calls=0;
 await assert.rejects(requestWithCaptionFallback(async () => { calls++; throw new Error('Network unavailable'); }, { query:'mutation { photoCaption }', variables:{input:{photoCaption:'Limestone'}} }), /Network/);
 assert.equal(calls,1);
});
test('new backend receives caption unchanged, including an explicit clear', async () => {
 for (const caption of ['Fold hinge','']) {
  const result=await requestWithCaptionFallback(async request => ({data:request.variables.input}), {query:'mutation { photoCaption }',variables:{input:{id:'one',photoCaption:caption}}});
  assert.equal(result.data.photoCaption,caption);
 }
});
