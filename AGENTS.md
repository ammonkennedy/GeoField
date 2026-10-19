# GeoField project guide

GeoField is a geology field-data app for web, iOS, and Android. Preserve existing
user workflows and data. Read `HANDOFF.md` when continuing recent work; read
feature documentation only when relevant. Keep these files concise.

## Project map

- `artifacts/geofield`: shared React/TypeScript/Vite app; primary implementation.
- `artifacts/geofield/ios` and `android`: Capacitor native projects using that app.
  App ID: `com.ammonkennedy.geofield`; web assets: `dist/public`.
- `artifacts/geofield-mobile`: separate Expo project; do not assume it is the
  production native app. Verify the requested build target before changing it.
- `amplify`: AWS backend; `lib/api-client-react`: API/storage integration.
- `src/lib` inside the shared app: account storage, offline queues, sync, geometry.
- Dataset pages are in `src/pages/dashboard.tsx`; measurements in `strike-dip.tsx`.
- Track details: `artifacts/geofield/docs/TRACK.md`; Android: `artifacts/geofield/ANDROID.md`.

## Product decisions to preserve

- Protect samples, measurements, trips, notes, photos, tracks, and dataset links
  across offline use, failed uploads, account changes, and concurrent devices.
- Use existing account-scoped durable storage and sync patterns. Do not clear
  pending edits before cloud confirmation or resurrect deleted records on download.
  Preserve originals/edit history and photo associations.
- Keep web and native behavior consistent where platform capabilities permit.
  Saving locally, pushing GitHub, deploying AWS, copying Capacitor assets, and
  publishing app-store builds are distinct actions; report their actual status.
- Clinometer is the sidebar name. Lineation uses plunge/azimuth; planar readings
  use strike/dip. Preserve existing calibration, magnetic-north default, presets,
  capture behavior, custom feature types, timestamps/elevation, and exports.
  Hidden coordinate fields must remain stored for maps/exports.
- Prefer simple blue GeoField styling and minimal explanatory text. Keep errors
  and useful recording status. Opening a note should not force typing mode.
- Saved-track navigation frames the trail, without automatically following GPS.
  Track lists separate Custom tracks and Downloaded tracks. Stop prompts for a
  name; deletion requires confirmation. Dataset tracks appear below measurements.
- Offline GPS does not imply offline basemap coverage. Missing elevation is
  unavailable, not zero. Do not invent route connections across missing segments.

## Working efficiently

- Inspect current files and Git status; preserve unrelated/uncommitted changes.
  Treat old conversation claims and handoff test results as historical evidence.
- Use pnpm (root packageManager specifies the version). Keep dependency patches
  and React type overrides; do not silence type errors by changing app behavior.
- Scope checks to the change. Batch related edits, then validate once. UI copy
  changes do not need a full regression sweep; sync/deletion changes need tests.
- Typical checks: `pnpm --filter @workspace/geofield typecheck` and
  `pnpm --filter @workspace/geofield build`. Root `pnpm build` covers the workspace.
- Regression suite: `node --test artifacts/geofield/tests/*.test.ts artifacts/geofield/src/lib/*.test.ts lib/api-client-react/tests/*.test.ts`.
- Never test by deleting real user data, clearing app storage, or uninstalling a
  user's app. Use isolated fixtures/accounts. Keep signing keys and secrets out of Git.
- Give concise results and material limits. Do not claim physical-device, live
  cross-device sync, deployment, or store-release verification from unit tests.
