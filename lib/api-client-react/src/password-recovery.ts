import type { resetPassword, confirmResetPassword } from 'aws-amplify/auth';

export function createPasswordRecovery(auth: {
  configured: () => boolean;
  request: typeof resetPassword;
  confirm: typeof confirmResetPassword;
}) {
  function username(email: string) {
    if (!auth.configured()) throw new Error('Cloud sign-in is not configured in this build.');
    if (!email.trim()) throw new Error('Enter your account email address.');
    return email.trim();
  }
  return {
    request: (input: { email: string }) => auth.request({ username: username(input.email) }),
    complete: (input: { email: string; code: string; password: string }) => {
      const name = username(input.email);
      if (!input.code.trim()) throw new Error('Enter the code from your reset email.');
      // Cognito verifies ownership and password policy. Never compare against a
      // previous password, trim password characters, or bypass code verification.
      return auth.confirm({ username: name, confirmationCode: input.code.trim(), newPassword: input.password });
    },
  };
}
