import { fetchAuthSession } from 'aws-amplify/auth';
import { list, uploadData, downloadData } from 'aws-amplify/storage';
import { requireFieldNoteAccount } from './generated/api';
export interface PreferenceCloudObject { key: string; revision: string; updatedAt: number; }
async function prefix(account: string) {
  await requireFieldNoteAccount(account);
  const session = await fetchAuthSession();
  await requireFieldNoteAccount(account);
  if (!session.identityId || session.tokens?.accessToken?.payload.sub !== account) throw new Error('Sign in to sync account settings.');
  return `media/${session.identityId}/account-preferences/`;
}
function file(item: PreferenceCloudObject) {
  if (typeof item.key !== 'string' || typeof item.revision !== 'string' || !/^[a-z0-9_.:-]{1,200}$/i.test(item.key) || !/^[\w-]{1,150}$/.test(item.revision) || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0) throw new Error('Invalid settings revision.');
  return `${encodeURIComponent(item.key)}/${item.updatedAt}.${item.revision}.json`;
}
export async function putPreferenceCloudObject(entry: PreferenceCloudObject, payload: unknown, account: string) {
  const path = await prefix(account) + file(entry);
  await uploadData({ path, data: JSON.stringify(payload), options: { contentType: 'application/json' } }).result;
  await requireFieldNoteAccount(account);
}
export async function getPreferenceCloudObject(entry: PreferenceCloudObject, account: string): Promise<unknown> {
  const path = await prefix(account) + file(entry);
  const response = await downloadData({ path }).result;
  await requireFieldNoteAccount(account);
  return JSON.parse(await response.body.text());
}
export async function listPreferenceCloudObjects(account: string): Promise<PreferenceCloudObject[]> {
  const path = await prefix(account);
  const latest = new Map<string, PreferenceCloudObject>();
  let nextToken: string | undefined;
  do {
    const page = await list({ path, options: { pageSize: 1000, nextToken } });
    await requireFieldNoteAccount(account);
    for (const object of page.items) {
      const match = /^([^/]+)\/(\d+)\.([\w-]+)\.json$/.exec(object.path.slice(path.length));
      if (!match) continue;
      const entry = { key: decodeURIComponent(match[1]), updatedAt: Number(match[2]), revision: match[3] };
      file(entry);
      const previous = latest.get(entry.key);
      if (!previous || entry.updatedAt > previous.updatedAt || (entry.updatedAt === previous.updatedAt && entry.revision > previous.revision)) latest.set(entry.key, entry);
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return [...latest.values()];
}
