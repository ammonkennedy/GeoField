import { fetchAuthSession } from 'aws-amplify/auth';
import { list, uploadData, downloadData } from 'aws-amplify/storage';
import { requireFieldNoteAccount } from './generated/api';
export interface TrackCloudObject { revision: string; parent?: string; }
const safe = (id: string) => { if (!/^[\w-]{1,150}$/.test(id)) throw new Error('Invalid track revision.'); return id; };
async function prefix(accountId: string) {
  await requireFieldNoteAccount(accountId);
  const session = await fetchAuthSession();
  await requireFieldNoteAccount(accountId);
  if (!session.identityId || session.tokens?.accessToken?.payload.sub !== accountId) throw new Error('Sign in to sync your tracks.');
  return `media/${session.identityId}/walking-tracks/`;
}
function file(object: TrackCloudObject) { return `${safe(object.revision)}.${object.parent ? safe(object.parent) : 'root'}.json`; }
export async function putTrackCloudObject(object: TrackCloudObject, payload: unknown, accountId: string) {
  const path = await prefix(accountId) + file(object);
  await uploadData({ path, data: JSON.stringify(payload), options: { contentType: 'application/json' } }).result;
  await requireFieldNoteAccount(accountId);
}
export async function getTrackCloudObject(object: TrackCloudObject, accountId: string): Promise<unknown> {
  const path = await prefix(accountId) + file(object);
  const result = await downloadData({ path }).result;
  await requireFieldNoteAccount(accountId);
  return JSON.parse(await result.body.text());
}
export async function listTrackCloudObjects(accountId: string): Promise<TrackCloudObject[]> {
  const path = await prefix(accountId);
  const objects: TrackCloudObject[] = [];
  let nextToken: string | undefined;
  do {
    const page = await list({ path, options: { pageSize: 1000, nextToken } });
    await requireFieldNoteAccount(accountId);
    for (const item of page.items) {
      const match = /^([\w-]+)\.([\w-]+)\.json$/.exec(item.path.slice(path.length));
      if (match) objects.push({ revision: match[1], ...(match[2] === 'root' ? {} : { parent: match[2] }) });
    }
    nextToken = page.nextToken;
  } while (nextToken);
  const superseded = new Set(objects.map(o => o.parent).filter(Boolean));
  return objects.filter(o => !superseded.has(o.revision));
}
