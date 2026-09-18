import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireCloudSession } from '../src/cloud-session.ts';

test('cloud sync proceeds with a valid AWS session', async () => {
  await requireCloudSession(async () => true);
});

test('remembered local login without AWS tokens requires cloud reauthentication', async () => {
  await assert.rejects(requireCloudSession(async () => false), { name: 'CloudSignInRequired' });
});

test('network failure is not misreported as logout', async () => {
  const error = Object.assign(new Error('Network error'), { name: 'NetworkError' });
  await assert.rejects(requireCloudSession(async () => { throw error; }), (error: Error) => {
    assert.notEqual(error.name, 'CloudSignInRequired');
    assert.match(error.message, /waiting for a connection/);
    return true;
  });
});

test('expired or rejected credentials offer reauthentication', async () => {
  for (const name of ['NotAuthorizedException', 'UserUnAuthenticatedException']) {
    await assert.rejects(requireCloudSession(async () => { throw Object.assign(new Error('Expired'), { name }); }), { name: 'CloudSignInRequired' });
  }
});

test('unexpected AWS errors remain visible', async () => {
  const original = new Error('Configuration error');
  await assert.rejects(requireCloudSession(async () => { throw original; }), (error) => error === original);
});
