export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: string; message?: string };
  return name === 'NetworkError' || /network error|network request failed|failed to fetch|load failed|network connection|network is offline/i.test(message ?? '');
}

export async function requireCloudSession(check: () => Promise<boolean>): Promise<void> {
  try {
    if (await check()) return;
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error('Cloud sync is waiting for a connection to AWS. Your local data is still available.');
    }
    const name = (error as { name?: string })?.name;
    if (name !== 'UserUnAuthenticatedException' && name !== 'NotAuthorizedException') throw error;
  }
  const error = new Error('Sign in again to reconnect cloud sync. Your local data is still available.');
  error.name = 'CloudSignInRequired';
  throw error;
}
