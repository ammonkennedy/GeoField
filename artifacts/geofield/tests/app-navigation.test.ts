import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigationEntry } from '../src/lib/app-navigation.ts';

test('project, sample, and tool routes retain navigation depth including query strings', () => {
  let entry = navigationEntry(undefined, '/', false);
  for (const [index, path] of ['/dataset/one', '/sample/new?folderId=one', '/map', '/strike-dip', '/stereonets'].entries()) {
    entry = navigationEntry(entry, path, false);
    assert.deepEqual(entry, { depth: index + 1, path });
  }
  assert.deepEqual(navigationEntry(entry, '/stereonets', true), entry);
});
test('direct links and sign-in boundaries have no app back destination', () => {
  assert.equal(navigationEntry(undefined, '/sample/old', false).depth, 0);
  const login = navigationEntry({depth: 5, path: '/dataset/old-account'}, '/login', false);
  assert.equal(login.depth, 0);
  assert.equal(navigationEntry(login, '/', false).depth, 0);
});
test('back follows actual app history and returns false for a directly opened page', async () => {
  const entries: any[] = [{ state: null, path: '/map' }];
  let index = 0;
  const location = { pathname: '/map', search: '', hash: '', href: 'https://example.invalid/map' };
  const update = (path: string) => { const url = new URL(path, location.href); Object.assign(location, {pathname:url.pathname,search:url.search,hash:url.hash,href:url.href}); };
  const mock = {
    get state() { return entries[index].state; },
    replaceState(state: any, _: string, url?: string) { entries[index] = {state,path:url || entries[index].path}; if(url) update(url); },
    pushState(state: any, _: string, url: string) { entries.splice(index+1); entries.push({state,path:url}); index++; update(url); },
    back() { index--; update(entries[index].path); },
  };
  (globalThis as any).window = {location};
  (globalThis as any).history = mock;
  try {
    const { initializeAppNavigation, goBackInApp } = await import('../src/lib/app-navigation.ts');
    initializeAppNavigation();
    assert.equal(goBackInApp(), false);
    mock.pushState({otherState:'preserved'}, '', '/dataset/one');
    mock.pushState(null, '', '/sample/new?folderId=one');
    assert.equal(goBackInApp(), true);
    assert.equal(location.pathname, '/dataset/one');
    assert.equal(mock.state.otherState, 'preserved');
    assert.equal(goBackInApp(), true);
    assert.equal(location.pathname, '/map');
    assert.equal(goBackInApp(), false);
  } finally { delete (globalThis as any).window; delete (globalThis as any).history; }
});
