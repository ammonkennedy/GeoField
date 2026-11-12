import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordRecovery } from '../src/password-recovery.ts';

test('email recovery verifies the code and allows choosing the same password unchanged', async () => {
  let currentPassword = ' ExistingPassword1! ';
  let requestedUser = '';
  const recovery = createPasswordRecovery({
    configured: () => true,
    request: async input => {
      requestedUser = input.username;
      return { isPasswordReset: false, nextStep: { resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE', codeDeliveryDetails: { deliveryMedium: 'EMAIL', destination: 'a***@example.com' } } };
    },
    confirm: async input => {
      assert.equal(input.username, requestedUser);
      if (input.confirmationCode !== '123456') throw new Error('CodeMismatchException');
      currentPassword = input.newPassword;
    },
  });
  const result = await recovery.request({ email: ' a@example.com ' });
  assert.equal(result.nextStep.resetPasswordStep, 'CONFIRM_RESET_PASSWORD_WITH_CODE');
  await assert.rejects(recovery.complete({ email: 'a@example.com', code: 'wrong', password: 'Replacement1!' }), /CodeMismatch/);
  assert.equal(currentPassword, ' ExistingPassword1! ');
  await recovery.complete({ email: 'a@example.com', code: ' 123456 ', password: currentPassword });
  assert.equal(currentPassword, ' ExistingPassword1! ');
  await recovery.complete({ email: 'a@example.com', code: '123456', password: 'Replacement1!' });
  assert.equal(currentPassword, 'Replacement1!');
});

test('missing code and unavailable auth never call confirmation', () => {
  let called = false;
  const dependencies = { configured: () => true, request: async () => { throw new Error('not called'); }, confirm: async () => { called = true; } };
  const recovery = createPasswordRecovery(dependencies);
  assert.throws(() => recovery.complete({ email: 'a@example.com', code: ' ', password: 'Password1!' }), /code/);
  assert.throws(() => createPasswordRecovery({ ...dependencies, configured: () => false }).complete({ email: 'a@example.com', code: '123456', password: 'Password1!' }), /not configured/);
  assert.equal(called, false);
});
