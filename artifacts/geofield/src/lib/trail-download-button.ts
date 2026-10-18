import type { TrailDownload } from './saved-trails';
export function trailDownloadButton(trail: TrailDownload) {
  const container = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Download';
  button.style.cssText = 'display:block;background:#087df0;color:white;border-radius:8px;padding:10px 16px;margin-top:10px;min-height:44px;';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const note = document.createElement('p');
  note.style.fontSize = '11px';
  note.textContent = 'Saves the route line for offline use, not background map tiles. Elevation gain is unavailable for downloaded trails.';
  button.onclick = async () => {
    button.disabled = true; button.textContent = 'Downloading…'; status.textContent = '';
    try {
      const { downloadTrail } = await import('./tracks');
      const id = await downloadTrail(trail);
      button.textContent = 'Downloaded';
      status.textContent = 'Saved in Track → Saved tracks and shown on the map.';
      const link = document.createElement('a'); link.href = `/map?track=${encodeURIComponent(id)}`;
      link.textContent = 'View saved track';
      link.onclick = event => { event.preventDefault(); history.pushState(null, '', link.href); window.dispatchEvent(new PopStateEvent('popstate')); };
      container.append(link);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Download failed. Please retry.';
      button.disabled = false; button.textContent = 'Download';
    }
  };
  container.append(button, status, note);
  return container;
}
