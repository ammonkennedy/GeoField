# Walking tracks

Open **Track** in the sidebar and choose **Activate**. Allow precise location.
Native Android/iOS builds use background location so a walk can continue with
another app open or the screen locked. Android also requests notification
permission and shows a recording notification. Do not force-close GeoField.
On the website, keep the page visible and screen awake; hidden intervals start
a new segment when you return. Choose **Stop tracking** when finished.

Each route includes its name, distance in miles, estimated ascent/descent in feet,
recorded GPS time and JSON export. Saved routes appear in green. **View route**
opens Map View with **Hiking Trails and Tracks** selected and fits the map to
the chosen route without automatically following GPS. There is no visibility
checkbox on track cards.

Points are saved in account-scoped IndexedDB transactions without needing
internet. Track geometry no longer competes with samples and preferences for the
small localStorage quota. Existing local tracks migrate automatically; original
copies are removed only after the database commit is read back and verified.
Stop waits for queued GPS writes, and sync waits for durable local confirmation. A reload/process exit preserves committed points and leaves the route
interrupted rather than silently restarting GPS. Sign-out stops recording.
Denied permissions, weak fixes, and storage failures are surfaced.

## Account sync

Stopped/interrupted tracks participate in the existing account sync flow. Active
tracks stay local until stopped. Private AWS storage holds immutable revisions;
uploads are read back and verified before clearing the pending flag. Failed
uploads remain pending, and edits made during an upload remain pending too.
Concurrent edits are preserved as an “other device copy” instead of discarded.
Map visibility is a device preference. Cloud omission never deletes local tracks.
The existing authenticated identity storage policy covers the new objects; no
new Amplify data model is required.

## Limits and verification

GPS distance excludes poor fixes, stationary jitter, implausible jumps, and gaps
between segments. Elevation gain excludes unknown/poor vertical accuracy and
uses a noise threshold. These are estimates, not surveyed measurements. Uncached
map tiles still need internet. Device storage is finite; a failed write stops
recording and keeps previously committed points.

Automated regression coverage includes track math and sync confirmation,
failures, concurrent edits, active-recording protection, and malformed data.
Android debug and iOS simulator builds have passed. Browser tests exercise
recording, navigation, route rendering, stopping, persistence, visibility and
permission denial using an isolated test account and injected GPS. Native GPS
callbacks and watcher removal have been exercised on the Android emulator.
Real outdoor accuracy, sustained locked-screen recording on physical phones,
and live AWS synchronization between two devices still need field validation.

The native dependency patch aligns its Swift package with Capacitor 8, keeps
its Android service private, and makes GPS hardware optional for installation.
Reinstall the native app after building: a website update alone cannot install
these native changes. Review location/background-service declarations when
preparing the next store submission.

## Saved trails

**Custom tracks** lists recorded walks and **Downloaded tracks** lists saved hiking trails. Both sections appear automatically below Activate. In
Map View, enable Hiking Trails, select a route/segment, then choose **Download**.
USGS downloads fetch the full selected object instead of rendered tile geometry;
marked OSM routes recursively include member ways. Duplicate downloads reuse the
saved item. Invalid or incomplete service responses leave existing tracks intact.
Downloads are account scoped, participate in Track sync, and retain source IDs.
Select a saved track's title or **View route** to display and frame it on the map.
Tap a saved blue track or its endpoint on the map for its name, distance,
elevation gain/loss, and GPS time or downloaded-source coverage. Details use
local track data and take priority over other overlay popups.

Distances describe the downloaded mapped geometry, not a round trip or planned
itinerary. USGS items are labeled segments. Downloaded trails currently have no
elevation profile, so gain/loss show Unavailable. Recorded walks retain their GPS
elevation estimates. Downloading preserves route lines, not basemap tiles.

Both track sections include Delete with confirmation. Active recordings must be
stopped first. Deletion immediately hides the route locally and retains a pending
deletion record for sync. Confirmed deletions suppress stale cloud revisions;
failed uploads keep the deletion pending. Downloading the same trail again creates
a new track without undoing the earlier deletion. After manually stopping a walk,
a naming popup allows a custom name or keeping the existing name.

Each custom/downloaded track has a Dataset dropdown, including No dataset.
Assignments persist locally and in cloud revisions. Tracks assigned to an offline
local dataset wait for that dataset's cloud ID before upload. Dataset pages list
assigned tracks below samples and structural measurements; selecting a track
opens its route on the map. Deleted tracks are excluded.

Storage quota regression: with Vite running on 127.0.0.1:5194, run
`node artifacts/geofield/tests/track-storage.browser.mjs` using Playwright. Optional
`PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` select an external test installation.
The test uses a disposable browser context, migrates 12,000 points, fills only
fixture localStorage, and checks recording, reload, account isolation, failed
database writes, and deletion tombstones. This is not physical-device validation.
