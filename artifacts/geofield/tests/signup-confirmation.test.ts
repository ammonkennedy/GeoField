import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../../../amplify/auth/pre-sign-up/handler.ts';

function event(triggerSource = 'PreSignUp_SignUp', email = 'field@example.com') {
  return { triggerSource, request: { userAttributes: { email } }, response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false } };
}
test('self-service accounts skip signup confirmation and remain eligible for email recovery', async () => {
  const result = await handler(event());
  assert.equal(result.response.autoConfirmUser, true);
  assert.equal(result.response.autoVerifyEmail, true);
  assert.equal(result.response.autoVerifyPhone, false);
});
test('signup policy does not change administrator or external-provider accounts', async () => {
  for (const source of ['PreSignUp_AdminCreateUser', 'PreSignUp_ExternalProvider']) {
    const input = event(source);
    assert.deepEqual((await handler(input)).response, { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false });
  }
});
test('missing email cannot create an unrecoverable account', async () => {
  await assert.rejects(handler(event('PreSignUp_SignUp', ' ')), /email address/);
});
