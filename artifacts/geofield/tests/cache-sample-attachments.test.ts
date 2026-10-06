import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheSampleAttachments } from '../src/lib/cache-sample-attachments.ts';

test('connection loss preserves downloaded photos and retry skips their download', async () => {
  let saved = { id: 'sample', fields: { notes: 'Keep', media: [{ kind: 'photo', storageKey: 'a' }, { kind: 'photo', storageKey: 'b' }] } } as any;
  await assert.rejects(cacheSampleAttachments(saved, async attachment => {
    if (attachment.storageKey === 'b') throw new Error('Connection lost');
    return { ...attachment, localKey: 'local-a' };
  }, partial => { saved = partial; }), /Connection lost/);
  assert.equal(saved.fields.media[0].localKey, 'local-a');
  assert.equal(saved.fields.media[1].storageKey, 'b');
  assert.equal(saved.fields.notes, 'Keep');
  const downloads: string[] = [];
  const result = await cacheSampleAttachments(saved, async attachment => {
    if (attachment.localKey) return attachment;
    downloads.push(attachment.storageKey);
    return { ...attachment, localKey: `local-${attachment.storageKey}` };
  });
  assert.deepEqual(downloads, ['b']);
  assert.equal(result.fields.media[1].localKey, 'local-b');
});
test('failure saving cache progress stops before fetching the next photo', async () => {
  const attempted: string[] = [];
  await assert.rejects(cacheSampleAttachments({ fields: { media: [{ id: 'a' }, { id: 'b' }] } }, async item => {
    attempted.push(item.id); return { ...item, localKey: 'cached' };
  }, () => { throw new Error('Account changed'); }), /Account changed/);
  assert.deepEqual(attempted, ['a']);
});
