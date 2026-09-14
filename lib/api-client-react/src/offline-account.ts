import type { AuthUser, AuthUserEnvelope } from './generated/api.schemas';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

// This remembers local app access, never passwords or cloud authorization tokens.
export function createOfflineAccount(storage: Storage, key: string) {
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
        const user = await load();
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
