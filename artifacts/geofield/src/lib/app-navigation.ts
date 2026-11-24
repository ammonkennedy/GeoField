const KEY = '__geofieldNavigation';
type Entry = { depth: number; path: string };

export function navigationEntry(previous: Entry | undefined, path: string, replace: boolean): Entry {
  // Authentication is a boundary: Back must not reopen the prior account's page.
  if (!previous || path.split('?')[0] === '/login' || previous.path.split('?')[0] === '/login') return { depth: 0, path };
  return { depth: previous.depth + (replace ? 0 : 1), path };
}

let initialized = false;
export function initializeAppNavigation() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const path = () => window.location.pathname + window.location.search + window.location.hash;
  const saved = history.state?.[KEY] as Entry | undefined;
  history.replaceState({ ...history.state, [KEY]: saved?.path === path() ? saved : { depth: 0, path: path() } }, '');
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = (state, unused, url) => {
      const destination = new URL(url ?? window.location.href, window.location.href);
      const nextPath = destination.pathname + destination.search + destination.hash;
      const entry = navigationEntry(history.state?.[KEY], nextPath, method === 'replaceState');
      original({ ...state, [KEY]: entry }, unused, url);
    };
  }
}

/** Only go back through known app entries, never to an unrelated external site. */
export function goBackInApp(): boolean {
  if ((history.state?.[KEY]?.depth ?? 0) <= 0) return false;
  history.back();
  return true;
}
