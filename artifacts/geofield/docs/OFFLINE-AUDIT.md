# Offline audit — 2026-10-20

## Verified locally

The regression suite passed 339 tests. Coverage includes durable saves and
backup recovery, account isolation, upload failures, confirmation before queue
removal, concurrent edits, deletion tombstones, and retry behavior for samples,
measurements, datasets, trips, notes, note folders, and tracks.

A disposable Chromium context with external requests blocked saved and reloaded:
water, rock, soil/sand and other samples; custom fields and coordinate precision;
new datasets and existing-cloud-dataset edits; planar and lineation measurements;
notes with photo/video bytes; note folder membership; trip targets; and track points.
Media fixtures test byte persistence, not valid image/video decoding or playback.

Run the maintained browser fixture with Vite on 127.0.0.1:5194:
`node artifacts/geofield/tests/offline-records.browser.mjs`.
Optional PLAYWRIGHT_MODULE and CHROMIUM_PATH select an external Playwright install.

## Gaps fixed in this audit

- Existing cloud dataset edits now save locally and queue for reconnect, retaining
  the same cloud ID instead of requiring a connection or creating a duplicate.
- Queue and dataset changes now trigger auto-sync; the pending-record check
  includes tracks, samples and datasets as well as notes/trips/measurements.
- Dataset acknowledgement checks returned IDs, names and descriptions before
  clearing pending edits. Newer edits made during sync remain pending.
- Dataset edits no longer implicitly restore cloud-deleted datasets. Only an
  explicit Restore request can do so.
- Sample attachment caching includes videos, not only photos.
- Successful sample/dataset downloads are persisted before waiting for unrelated
  sync operations and attachment downloads.

## Limits

This is not proof of live AWS synchronization for every account, a physical-phone
airplane-mode/locked-screen test, or installation/deployment of these changes.
An authorization denial can still require investigation of the actual cloud
record and account. Failed uploads retain pending changes.

Supported photo/video inputs remain subject to the existing size limits and
device codec support. Arbitrary formats and unlimited storage are not supported.
Imported custom map layers and saved PRISM regions currently remain device-local;
they do not have an account-sync path. Basemap tiles are not automatically cached.
A first-time sign-in requires connectivity; an already remembered account is
needed for account-scoped offline work.
