# Current handoff — 2026-10-18

This is a snapshot, not a new task list. Verify Git status before proceeding.
User wants lower usage through short project context and fresh focused chats.

## Repository status at handoff

Branch `master`, origin `https://github.com/ammonkennedy/GeoField.git`.
HEAD `3dc2d87` (Track updates); local origin/master matches it, but no fresh
remote fetch was done for this handoff. Earlier `fb4b523` added native Android,
Track/saved-trail support and accumulated fixes.

Uncommitted application work: track dataset assignment, plus its docs/tests.
Files: `src/pages/track.tsx`, `src/pages/dashboard.tsx`,
`src/components/TrackDatasetSelect.tsx`, `src/components/DatasetTracks.tsx`,
`src/lib/tracks.ts`, `src/lib/track-sync.ts`, `src/lib/sync-tracks.ts`,
`tests/track-sync.test.ts`, `docs/TRACK.md` (all under artifacts/geofield).
This guide and handoff are also new local files. Do not assume these are pushed.

## Recent feature state

- Track records walks with Activate/Stop, durable GPS points, distance and filtered
  elevation estimates; native background plugin support; website foreground only.
- Hiking trail popups have Download. USGS saves full selected segments; OSM route
  members come from Overpass. Downloads save geometry, not base-map tiles.
- Custom tracks and Downloaded tracks are always listed below the large Activate
  button. Stop opens naming popup; cancel keeps default. Confirmed Delete hides
  route/list entries and queues a deletion tombstone; active tracks cannot delete.
- Map `?track=<id>` frames the selected route and skips automatic GPS following.
- Tracks sync through immutable private S3 snapshots in existing identity storage.
  Concurrent revisions are preserved; deletion suppresses stale revisions.
- Latest work adds Dataset dropdowns to both track types, No dataset option, and
  clickable dataset track cards below samples/measurements. Dataset assignment is
  included in snapshots. Offline local dataset IDs resolve to cloud IDs before
  upload; unresolved assignments stay pending.

## Validation already performed on latest application changes

Shared app typecheck and Vite build passed; 308 regression tests passed.
Isolated browser checks passed for dataset assignment, persistence after reload,
placement below measurements, and unassignment. Earlier browser checks covered
track naming, deletion, route rendering and avoiding automatic GPS follow.
Latest web assets copied to Android and iOS projects; this is not a new native
build/store release. No live website deployment verified for these changes.

Evidence logs may remain in `/tmp/geofield-track-dataset-{types,tests,build}.log`.
Temporary browser tests in `/tmp/geofield-track-testing/` are optional evidence,
not durable repo tooling. Use repo tests as the maintained baseline.

## Limits to retain in future reports

- Live two-device AWS track sync and sustained physical-phone locked-screen
  recording have not been validated. Prior native compilation passed, not field GPS.
- Downloaded trails currently show elevation gain/loss as Unavailable. Recorded
  walks use available GPS altitude. Trail downloads do not include offline tiles.
- Download UI/geometry was tested with mocked network fixtures; latest live
  Overpass requests did not return usable JSON, so live service success is unverified.
- Android emulator launch behaved inconsistently after a prior install; do not
  infer a physical-device pass. Preserve installed user data when investigating.

Next work should follow the user's new request. No need to repeat completed
checks or scan the entire repository merely to start a new conversation.
