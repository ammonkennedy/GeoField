import type { Map as MapLibreMap } from 'maplibre-gl';

/** Layout changes (including full screen) do not necessarily resize the window. */
export function observeMapSize(map: MapLibreMap) {
  const container = map.getContainer();
  let width = container.clientWidth;
  let height = container.clientHeight;
  const observer = new ResizeObserver(() => {
    const nextWidth = container.clientWidth, nextHeight = container.clientHeight;
    if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
    width = nextWidth; height = nextHeight;
    // Run before paint so an old full-screen canvas cannot linger after shrinking.
    map.resize();
    map.triggerRepaint();
  });
  observer.observe(container);
  map.once('remove', () => observer.disconnect());
}
