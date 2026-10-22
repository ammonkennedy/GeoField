import type { Popup } from 'maplibre-gl';

/** Let map gestures pass through information, while keeping actions accessible. */
export function mapNavigablePopup<T extends Popup>(popup: T): T {
  const root = popup.getElement();
  root.classList.add('geofield-pan-through-popup');
  let frame = 0;
  let closed = false;
  const update = () => {
    frame = 0;
    if (closed) return;
    const content = root.querySelector<HTMLElement>('.maplibregl-popup-content');
    if (!content) return;
    const scroller = [...content.querySelectorAll<HTMLElement>('div')].find(element =>
      ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) &&
      element.scrollHeight > element.clientHeight + 1);
    let controls = content.querySelector<HTMLElement>('.geofield-popup-scroll');
    if (!scroller) { controls?.remove(); return; }
    if (controls) return;
    controls = document.createElement('div');
    controls.className = 'geofield-popup-scroll';
    for (const [text, direction] of [['Scroll details up', -1], ['Scroll details down', 1]] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = direction < 0 ? '↑' : '↓';
      button.setAttribute('aria-label', text);
      button.title = text;
      button.addEventListener('click', event => {
        event.stopPropagation();
        scroller.scrollBy({ top: direction * Math.max(80, scroller.clientHeight * 0.7), behavior: 'smooth' });
      });
      controls.append(button);
    }
    content.append(controls);
  };
  const schedule = () => { if (!closed && !frame) frame = requestAnimationFrame(update); };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  const resize = new ResizeObserver(schedule);
  resize.observe(root);
  schedule();
  popup.on('close', () => {
    closed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
  });
  return popup;
}
