type Session = { tokens?: { accessToken?: { payload: { sub?: unknown }; toString(): string } } };

/** Bind one request to its original account, even if the SDK session changes. */
export async function captureAccountAuthorization(
  accountId: string,
  loadSession: () => Promise<Session>,
  isSignedOut: () => Promise<boolean>,
) {
  const signInRequired = () => {
    const error = new Error("Account changed or signed out while preparing sync. Sign in again; your local data remains saved.");
    error.name = "CloudSignInRequired";
    return error;
  };
  if (!accountId || await isSignedOut()) throw signInRequired();
  let session: Session;
  try { session = await loadSession(); }
  catch (error) {
    if (["NotAuthorizedException", "UserUnAuthenticatedException"].includes((error as Error)?.name)) throw signInRequired();
    throw error;
  }
  const token = session.tokens?.accessToken;
  if (!token || await isSignedOut()) throw signInRequired();
  if (token.payload.sub !== accountId) {
    throw new Error("Account changed while preparing sync. Your local data remains saved.");
  }
  return { authMode: "userPool" as const, authToken: token.toString() };
}
