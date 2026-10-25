# Interactive stereonets

The shared app exposes **Views → Stereonets** for signed-in accounts, including
remembered accounts offline. Each saved net can be assigned to an existing trip
(the app's project grouping) and contains independently styled datasets.

The page now opens directly into the Plot workspace. The Plot, Measurements,
Datasets, Import, and Analysis tabs and their editing/analysis panels have been
removed. Dataset selection, saved nets, plot controls, and exports remain.
Existing saved measurements and dataset styles are retained. The mathematical
analysis modules below remain available internally but have no page controls.

## Architecture and conventions

- `src/lib/stereonet/math.ts`: pure geometry and spherical statistics.
- `model.ts`: canonical measurements, imports, explicit north normalization.
- `storage.ts`, `sync.ts`, `sync-account.ts`: account-scoped durable local saves
  and immutable private-cloud revisions, following the existing track pattern.
- `StereonetPlot.tsx`: SVG net, grid, points, planes, touch pan/pinch and legend.
- `pages/stereonets.tsx`: workspace, editable records, imports and analysis.
- `export.ts`: high-resolution PNG, image-backed PDF, and UTF-8 CSV.
- `lib/api-client-react/src/stereonet-storage.ts`: private identity-scoped S3
  objects under `media/{identityId}/stereonets/`; existing storage policy applies.

Vectors are east/north/down. Azimuth increases clockwise from north. Canonical
planes use right-hand-rule strike and dip; a lower pole has trend `strike−90`
and plunge `90−dip`. Lines use trend/plunge. Plane curves are sampled from exact
orthonormal spherical bases, not fitted 2D arcs. Horizontal planes use the full
perimeter; other planes use the lower semicircle. Schmidt radius is
`sqrt(1−sin(plunge))`; SVG y is negative north. Small circles have constant
spherical angle from the north axis. The projection function also supports the
Wulff formula for future UI use; the current UI uses Schmidt only.

References checked during implementation:
- [RockWare projection formulas](https://help.rockware.com/rockworks/WebHelp/stereonet_proj.htm)
- [mplstereonet RHR conventions](https://mplstereonet.readthedocs.io/en/latest/_modules/mplstereonet/stereonet_math.html)
- [mplstereonet axial/girdle eigenvector methods](https://mplstereonet.readthedocs.io/en/latest/_modules/mplstereonet/analysis.html)

The workspace's **Plot measurement datasets** selector lists only datasets with
structural measurements, including offline and uncategorized records. Select one
or multiple datasets (or Select all), then Plot selected datasets. The app creates
a net if necessary, preserves dataset names/colors, and avoids duplicate source
records on repeated imports. Source dataset IDs resolve local/cloud aliases.

Imports choose the north reference that can plot the most measurements using
known metadata (ties retain the current reference). True-north-only data therefore
do not require conversion to the default magnetic reference. Existing affected
nets offer a one-click switch to the compatible reference. Mixed references still
require an explicit declination when no correction is stored; no zero correction
is assumed.

Imports are independent snapshots. Original source IDs, timestamps, coordinates,
notes and orientation metadata are retained in `raw`; inline photo bytes are
excluded, with source/photo keys retained. Editing a snapshot keeps the raw
import and appends edit history. Original GeoField records are not changed.
Ambiguous legacy quadrant strings are rejected instead of guessed.

Every measurement retains its original north reference. Converting to the net's
reference requires an explicit east-positive declination, using the measurement
value first and dataset value second. Unknown references require an explicit
dataset assumption or measurement edit. Unresolved records are visibly excluded
from plotting and block analysis. Raw values are unchanged by normalization.

## Analysis and exports

Axial means use the largest eigenvector of the uncentered orientation tensor;
bedding girdles use its smallest eigenvector. At least three orientations are
required. An eigenvalue separation below 0.05 is rejected as an unstable fit;
this is a numerical/interpretive guard, not a confidence interval. Directional
line means use normalized vector sums and reject small resultants. Intersections
use the cross product of plane normals and reject parallel planes. Analyses use
visible, feature-filtered data in the selected dataset; plane intersections use
the two checked visible planes. Visual pole clustering is available through the
pole display and dataset isolation. No stress inference, density contours or
confidence regions are provided.

PNG/PDF exports include the full unzoomed visible net, title, legend, north
reference and the current analysis result. PNG width is 1800 pixels. PDF embeds
a high-resolution JPEG on a proportionally sized page; it is not vector artwork.
CSV includes all measurements, hidden datasets, raw metadata and normalized
azimuths (or an unresolved marker). Spreadsheet formula prefixes are escaped.
No new dependencies were added; PDF uses a small single-image PDF writer.

Saves verify durable local storage before acknowledging success. Uploads remain
pending until read-back confirmation. Concurrent device versions are retained as
separate copies; deletions retain tombstones. Updates participate in the existing
sync/retry and pending-item UI. Cloud upload uses existing AWS storage permissions;
no new GraphQL model or backend schema is required.

## Validation and limits

Automated tests cover cardinal and oblique geometry, lower-hemisphere selection,
horizontal/vertical and near-vertical planes, wraparound, known girdles, undefined
fits, reference conversion, import metadata, account isolation, quota errors,
concurrent edits, confirmation failures and tombstones.

Isolated Chromium checks cover phone layout, manual entry, imported snapshots,
touch selection, pinch zoom, offline reopen, north conversion and PNG/PDF/CSV.
They do not establish physical iOS/Android behavior or live AWS cross-device sync.
The new code is shared by Capacitor builds, but native assets were not copied and
no native binary, website deployment or store release was performed.

## Recorded strike versus auxiliary dip direction

Imports prioritize the recorded RHR strike (`strikeDegrees`, then numeric
`strike`). Some clinometer captures retain an oppositely directed auxiliary
`dipDirectionDegrees`, with calibration applied only to strike. Deriving strike
from that field produced a near-180° rotation and lost the calibration. Dip
direction is now only a fallback when no numeric strike exists. The spherical
projection and RHR pole formulas are unchanged.

On reopening, untouched old imported planes that exactly match the previous
importer's calculation are repaired from retained source metadata. The previous
azimuth is retained in `raw.stereonetImportRepair`, and a new local revision
queues the corrected net for sync. Deleted nets and manually edited snapshots
are not rewritten. Original GeoField measurements are unchanged.
