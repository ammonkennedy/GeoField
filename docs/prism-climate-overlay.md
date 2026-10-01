# PRISM climate overlay

Map View → PRISM Climate shows **annual 1991–2020 normals** for the contiguous
United States, at PRISM's nominal **4 km** resolution. Users select annual
precipitation or annual mean/average daily minimum/average daily maximum
temperature. All four values appear when a cell is tapped. Minimum/maximum are
averages of daily lows/highs, not record extremes; this is not current weather.

## Offline and export

Download visible region stores intersecting original climate cells for all four
variables in a separate IndexedDB database (`geofield_prism_regions`). Downloads
are public reference data on that device, not account records. Reopening the
overlay restores a saved region; its dropdown switches among saved regions.
Basemap imagery is **not** included. On the website, the app page itself must
already be available; this feature does not install an offline website shell.
Installed Capacitor builds contain the climate assets and app shell.

The region cap is 100,000 cells (about 1.6 MB of numeric data across four grids).
Larger views ask users to zoom in. Empty/ocean/out-of-coverage regions cannot be
saved. Storage errors are surfaced without modifying sample/measurement storage.
CSV export includes cell centres, four variables with units in headers, the
normal period, nominal resolution, source URL and source access date. A selected
saved region only exports the intersection of that region and the current view.
Browser/device storage removal removes downloads; exports are independent files.

## Provenance and regeneration

Official source: https://prism.oregonstate.edu/normals/
Terms: https://prism.oregonstate.edu/terms/

`public/prism/manifest.json` records original download URLs, SHA-256 checksums
of original archives and access date. Four gzipped little-endian Float32 grids
are pinned with the app (~4.2 MB total); no per-user scraping or live PRISM server
dependence. Nodata (-9999) remains transparent and is never shown as a value.

To regenerate, install `rasterio` into a temporary Python virtual environment,
then run `scripts/prepare-prism.py /tmp/geofield-prism-source` with that Python.
The script caches source ZIPs to avoid repeat downloads. Review source changes
and their metadata before shipping new assets. Reprojection from NAD83 to WGS84
uses nearest-neighbour sampling on the original angular grid footprint. Original
cell values are retained. A Mercator-resampled image is used only for display;
clicks, cell outlines, offline subsets and CSV use the numeric grid directly.
The overlay and exported map images carry source/date attribution.

## Validation

`node --test artifacts/geofield/tests/prism.test.ts` checks cell boundaries,
no-data/zero/negative handling, subset geometry, CSV provenance and bundled grids.
Browser checks cover real-data popups, saving a region, switching the variable
while offline, restoring from IndexedDB on a fresh document with climate network
requests blocked, and CSV export. App Store deployment and physical-device
field testing remain separate release steps.
