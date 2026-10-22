import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncErrorGrace } from '../src/lib/sync-error-grace.ts';

test('first failure waits five seconds and early retries cannot show an error', () => {
 const grace = new SyncErrorGrace();
 assert.deepEqual(grace.failure(1000), { show: false, verifyAfter: 5000 });
 assert.deepEqual(grace.failure(3000), { show: false, verifyAfter: 3000 });
 assert.deepEqual(grace.failure(5999), { show: false, verifyAfter: 1 });
});
test('only a failed check after the grace period exposes persistent errors', () => {
 const grace = new SyncErrorGrace();
 grace.failure(0);
 assert.deepEqual(grace.failure(5000), { show: true, verifyAfter: 0 });
 assert.equal(grace.failure(15000).show, true);
});
test('recovery, offline transition, and account reset give later failures a fresh grace period', () => {
 const grace = new SyncErrorGrace();
 grace.failure(0);
 grace.reset();
 assert.deepEqual(grace.failure(20000), { show: false, verifyAfter: 5000 });
});
