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

## Nov 1 — Regional Geology offline caching (local, not deployed)
- Regional Geology previously used direct remote Macrostrat vector tiles, with no durable offline cache. Added shared MapLibre protocol in Map View/trip planner; viewed tiles persist in separate IndexedDB `geofield_geology_tiles_v1`. Cache-first; 32 MiB cap, preserves existing tiles and reports full/unavailable storage. No account data or offline edit queues changed.
- UI explains that areas/zoom levels must be viewed online first; basemaps and extra source details are not included. This is viewed-tile caching, not an area-download feature.
- Focused geology/cache tests (12), app typecheck and Vite build passed. No physical-phone airplane-mode test, native asset copy/build, or deployment performed.

## Nov 1 — Offline geology area downloads (local, not deployed)
- Added Download geology area, progress/cancel, and saved-area picker to Map View and trip planner. Saves visible extent at zooms 0–14, caps each job at 600 tiles / three concurrent requests; interrupted tiles survive retry. Completion metadata only saved after all tile writes succeed. Cache budget now 128 MiB, separate from field/account storage, no automatic eviction. Geology source maxzoom 14 allows magnification of saved detail at higher zoom.
- PRISM/fault rendering no longer waits for remote tile completion; trip planner initializes on style.load. Offline geology taps show stored polygon attributes immediately. Neutral map background, offline status, and online-event source retries added.
- 32 focused tests passed (geology caching/downloads/queries, PRISM, track map); typecheck and production web build checked. No physical-device offline validation, native asset copy/build, push, or deployment. Satellite/street/topo/terrain, public trail/soil services and additional geology references still require network.

## Nov 1 — Forgot password (local, not deployed)
- Login adds Forgot password → email code → code/new password/confirmation → sign-in, plus resend cooldown and expired/incorrect-code handling. Handles Cognito RESET_PASSWORD step and PasswordResetRequiredException. Keeps offline account/data untouched.
- API wraps Amplify resetPassword/confirmResetPassword through password-recovery.ts. Never compares with old password or trims password characters; successful code verification is required.
- Backend explicitly sets PasswordHistorySize=0 and verified_email recovery. This configuration must be deployed for live reuse behavior; no live account reset/email or backend deployment performed.
- Two isolated recovery tests pass, including same-password reuse and failed-code rejection; library/app typechecks and production build pass. No phone UI test.

## Nov 1 — Signup without initial email code (local, not deployed)
- Added Amplify preSignUp trigger for self-service email/password signup: autoConfirmUser=true, autoVerifyEmail=true, phone unchanged/false. Email recovery eligibility must be enabled for the requested Forgot password flow; the flag is not independent proof of email ownership. Password recovery still requires the emailed code. Admin/external-provider events are unchanged.
- Login respects isSignUpComplete and returns new users to sign-in without confirmation. Keeps fallback for older unconfirmed accounts/backends during rollout; removes prominent Verify your email action.
- Five signup/recovery tests, app typecheck, production build passed. Backend configuration typecheck also run. Backend/frontend deployment and live signup/recovery testing remain outstanding; no real accounts modified.

## Nov 11 — Quiet airplane-mode sync
- Android WebView can report online during transport failures. Sync now treats pure connection failures as offline UI state, clears the red error banner, and retains bounded retries and all pending records. Mixed data/auth/server failures still surface normally. Successful sync or online event restores connection status.
- Five sync-retry tests, app typecheck, and Android debug build passed. Updated connected Samsung via adb install -r; no uninstall/storage reset. No full airplane-mode/reconnection data-sync test performed.

## Nov 11 — Ecuador sample safety audit
- Fixed reopening queued edits by cloud ID, saving sheets after queue sync, stale local edit/deletion protection, draft account binding, async media sheet/account guards and submit locking. Cloud sync updates now use a server-side updatedAt condition; malformed cloud sample fields fail instead of silently becoming empty.
- All 414 regression tests, library/app typechecks, web build and Android debug build passed. New isolated tests include 120 offline water samples with lost upload responses. No installation/deployment/live AWS or physical airplane-mode test performed for these new fixes.
- See `artifacts/geofield/docs/SAMPLE-FIELD-READINESS.md` for scope, evidence and the remaining phone/reconnect release gate. Unsaved forms are not persistent drafts; exports exclude photo/video binaries.

## Nov 17 — Multi-day offline reopening
- Remembered-account startup now falls back to local access after 1.5 seconds if a network/account request stalls while Android reports online. Late results cannot replace the remembered account; explicit logout behavior remains intact.
- Added 30-day/120-launch simulated account tests and 30-day/120-storage-reopen sample/cache tests, retaining water values and attachment references. All 417 regression tests passed; library/app typechecks passed. These are isolated simulations, not physical-phone or attachment-playback verification. No native installation/deployment performed.
