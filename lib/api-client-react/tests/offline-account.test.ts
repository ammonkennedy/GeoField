import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOfflineAccount } from '../src/offline-account.ts';

const alice = { id: 'alice', email: 'alice@example.com', firstName: null, lastName: null, profileImageUrl: null };
const bob = { ...alice, id: 'bob', email: 'bob@example.com' };
function storage() {
  const values = new Map<string, string>();
  return { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
}
const unavailable = async () => { throw new Error('Network unavailable or token refresh failed'); };

test('confirmed account survives an offline app restart without making a network call', async () => {
  const disk = storage();
  await createOfflineAccount(disk, 'account').resolve(async () => alice, false);
  const restarted = createOfflineAccount(disk, 'account');
  assert.deepEqual(await restarted.resolve(async () => { assert.fail('must not contact network'); }, true), { user: alice });
});

test('refresh failure retains local access even when connectivity detection says online', async () => {
  const account = createOfflineAccount(storage(), 'account');
  await account.remember(alice);
  assert.deepEqual(await account.resolve(unavailable, false), { user: alice });
});

test('first-time offline users remain signed out', async () => {
  assert.deepEqual(await createOfflineAccount(storage(), 'account').resolve(unavailable, true), { user: null });
});

test('explicit logout persists across restart and blocks stale SDK credentials', async () => {
  const disk = storage();
  const account = createOfflineAccount(disk, 'account');
  await account.remember(alice);
  await account.clear();
  const restarted = createOfflineAccount(disk, 'account');
  assert.deepEqual(await restarted.resolve(async () => alice, false), { user: null });
  assert.deepEqual(await restarted.resolve(unavailable, true), { user: null });
  await restarted.remember(bob);
  assert.deepEqual(await restarted.resolve(unavailable, true), { user: bob });
});

test('an in-flight account lookup cannot undo logout', async () => {
  const account = createOfflineAccount(storage(), 'account');
  let release!: (value: typeof alice) => void;
  let started!: () => void;
  const loading = new Promise<void>((resolve) => { started = resolve; });
  const result = account.resolve(() => { started(); return new Promise((resolve) => { release = resolve; }); }, false);
  await loading;
  await account.clear();
  release(alice);
  assert.deepEqual(await result, { user: null });
  assert.deepEqual(await account.resolve(unavailable, true), { user: null });
});

test('corrupt storage cannot grant local account access', async () => {
  const disk = storage();
  await disk.setItem('account', '{broken');
  assert.deepEqual(await createOfflineAccount(disk, 'account').resolve(unavailable, true), { user: null });
});
