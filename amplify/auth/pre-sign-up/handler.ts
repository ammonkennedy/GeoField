interface SignUpEvent {
  triggerSource: string;
  request: { userAttributes: Record<string, string | undefined> };
  response: { autoConfirmUser: boolean; autoVerifyEmail: boolean; autoVerifyPhone: boolean };
}

export async function handler<T extends SignUpEvent>(event: T): Promise<T> {
  // Email is the pool's username, not a transferable login alias. Only apply
  // this product policy to self-service email/password signup.
  if (event.triggerSource === 'PreSignUp_SignUp') {
    if (!event.request.userAttributes.email?.trim()) throw new Error('An email address is required.');
    event.response.autoConfirmUser = true;
    // Cognito requires this flag to deliver ForgotPassword codes. It is not
    // proof of email ownership; recovery still requires the emailed code.
    event.response.autoVerifyEmail = true;
    event.response.autoVerifyPhone = false;
  }
  return event;
}
