import type { AuthUser, AuthUserEnvelope } from './generated/api.schemas';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

// This remembers local app access, never passwords or cloud authorization tokens.
export function createOfflineAccount(storage: Storage, key: string, cachedLookupTimeoutMs = 1500) {
  let revision = 0;
  let writes = Promise.resolve();
  const write = (value: unknown) => {
    writes = writes.catch(() => {}).then(() => storage.setItem(key, JSON.stringify(value)));
    return writes;
  };
  const read = async (): Promise<{ user: AuthUser | null; signedOut?: boolean }> => {
    await writes.catch(() => {});
    try {
      const value = JSON.parse(await storage.getItem(key) ?? 'null');
      if (value?.signedOut === true) return { user: null, signedOut: true };
      if (typeof value?.user?.id === 'string' && value.user.id) return { user: value.user };
    } catch { /* No usable remembered account. */ }
    return { user: null };
  };
  return {
    async isSignedOut() {
      return (await read()).signedOut === true;
    },
    async remember(user: AuthUser) {
      revision++;
      await write({ user });
    },
    async clear() {
      revision++;
      // Persist an explicit logout marker, even if AWS sign-out cannot finish.
      await write({ user: null, signedOut: true });
    },
    async resolve(load: () => Promise<AuthUser>, offline: boolean): Promise<AuthUserEnvelope> {
      const started = revision;
      const cached = await read();
      if (started !== revision) return { user: null };
      if (cached.signedOut || (offline && cached.user)) return { user: cached.user };
      try {
        // A WebView can claim to be online while a token refresh hangs. Local
        // access must not depend on that request when an account is remembered.
        let timer: ReturnType<typeof setTimeout> | undefined;
        let user: AuthUser;
        try {
          user = cached.user ? await Promise.race([
            load(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('Account lookup timed out')), cachedLookupTimeoutMs);
            }),
          ]) : await load();
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
        if (started !== revision) return { user: null };
        await write({ user });
        if (started !== revision) return { user: null };
        return { user };
      } catch {
        return { user: started === revision ? cached.user : null };
      }
    },
  };
}
