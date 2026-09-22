# Data storage and sync audit — September 19, 2026

Scope: the Capacitor/Xcode app in `artifacts/geofield`, its shared Amplify API, the separate Expo client's local-save/snapshot paths, and the older REST deletion routes. No production records were deleted or test samples written to a real account. No backend schema change is required by these fixes.

## Changes

- Local collection reads recover from a valid backup even when storage is full. Two unreadable copies produce an error rather than an empty collection that could overwrite the original. Interrupted writes retain the last committed copy.
- Samples, measurements, datasets, trips, trash, and downloaded sample caches are stored per remembered account. Legacy unscoped collections are copied, never erased, and attributed once to the first remembered account using the upgraded app. Later accounts cannot adopt the same legacy collection. Notes already used per-account storage.
- Account deletion removes only that account's local collections. It no longer wipes every account's records or the shared photo database.
- All sample saves and edits enter the durable queue before network activity. Retries reuse the same ID. Complete returned fields and attachments are checked before acknowledgment; a durable downloaded copy is written before removing the queue item.
- Sample attachments upload before the corresponding sample is acknowledged. Uploaded references use stable S3 keys. Downloaded sample photos are cached locally for offline use. Videos retain cloud references and are not automatically downloaded for offline use.
- Sample forms use cached records when offline, do not reset unsaved text on background refresh, wait for attachment loading, preserve unavailable attachment references, and preserve attachments beyond the three visible slots.
- Pending edits and deletions made during uploads survive acknowledgment. Queued sample deletions, measurement deletions, and local dataset deletions have durable pending state rather than being silently forgotten. Existing local trash entries for older deleted measurements and cloud-linked datasets are migrated into pending deletion records so an upgrade does not resurrect them.
- Cloud tombstones, including cached sample tombstones, prevent stale lists from resurrecting deleted records. Sample lists, maps, and figures combine durable cached records with cloud results and prefer pending edits without displaying duplicate originals. Missing entries alone are not treated as proof of deletion.
- Dataset detachment checks cloud errors and preserves samples and measurements. Dataset links can be repaired after an interrupted local relinking operation. Dataset creation cannot reuse a local ID in the same millisecond.
- Paginated downloads and the sync orchestrator check account identity before applying results. Account changes cannot write old snapshots into the new account's local collections.
- Detected concurrent sample edits are saved as a recovered copy. Notes and measurements with a known last-synced version preserve the other device's version as a separate copy before replacement. Measurement and note mutation timestamps now come from the backend.
- Routine reads, including the older REST trash endpoints, no longer permanently purge deleted records based on elapsed time. The 20-day automatic-purge text has been removed.
- The separate Expo client awaits serialized local writes, recovers storage backups, preserves edits/deletions made during sync, retains structured imported sample fields, and propagates deletion markers. A sync lock prevents overlapping runs; a stored owner prevents syncing its existing local database into a different account.

## Validation

Regression tests cover storage corruption/full storage, account switching and deletion, upload retries, missing cloud acknowledgment, attachment failures, sample/measurement/note conflicts, cloud tombstones, dataset relinking, ID collisions, and edits/deletions during sync. Run:

```
node --test artifacts/geofield/tests/*.test.ts lib/api-client-react/tests/*.test.ts
npm run typecheck
/bin/bash artifacts/geofield/scripts/xcode-build-web.sh
```

The all-workspace deployment build also includes a separate Expo deployment target that requires its deployment-domain environment setting; the Xcode build uses the Capacitor target.

## Limits and device acceptance checks

- These are code and automated regression checks, not a live two-iPhone account test. Before shipping, use a disposable test account on two devices to save/edit/delete/restore each record type, attach photos, switch accounts, and repeat in airplane mode and after force-quitting/relaunching.
- Conflict detection uses the last observed cloud version. It is not an atomic server-side compare-and-swap transaction. Exactly simultaneous writes between a read and a mutation can still require backend versioning to guarantee conflict prevention. Do not claim all concurrency races are eliminated.
- Legacy unscoped local data has no provable historical owner; the migration cannot reconstruct one. Preserve the original local-storage copies when investigating a shared device with older records.
- The original audit left trips and measurement photos device-local. The subsequent September 20 feature addition below adds their account sync for the Capacitor/Xcode app.
- The separate Expo client still has a different data model and UI from the App Store/Xcode app. Its existing local database is bound to one account; it does not provide the Capacitor app's full account-switching or conflict-copy workflow.
- Local backups on the same device do not survive app removal, cleared app storage, or loss of the device. Pending uploads have not reached AWS. This audit does not verify AWS point-in-time recovery or S3 versioning settings.

## Second pass — September 20, 2026

- Measurement and note batches persist each successful acknowledgment immediately, even if another record or the final download fails. A bad record no longer prevents unrelated pending records from syncing.
- Direct reads reconcile stale list responses and lost mutation responses. Matching cloud content is acknowledged without unnecessary duplicate writes or conflict copies; note retries reuse confirmed cloud photo keys.
- Sample delete/restore operations update deletion markers without replacing newer fields or attachments with archived snapshots. Unconfirmed changes stay pending. Lost create responses preserve later remote edits using deterministic recovery copies.
- Sample comparison ignores expiring signed URLs and device-local photo-cache paths, but still verifies actual fields and attachment identities.
- Main sync requests carry authorization captured for the initiating account, including pagination and dataset detachment. Account changes during token refresh are rejected. Expired authentication inside a batch remains a sign-in error rather than causing endless network retries.
- Sample saves reject an account switch during attachment preparation; delayed measurement GPS callbacks cannot update a different account's storage.
- Fixed a React Query callback mismatch that could accidentally request deleted datasets during normal dataset listing.

Validation: all 131 regression tests passed, all workspace TypeScript checks passed, and the GeoField web build completed with assets copied into the Xcode iOS project. Vite emitted a nonfatal tooltip sourcemap warning. No GitHub push or AWS deployment was performed.

The limits above still apply, especially the absence of atomic server-side conflict checks and live two-device verification. These changes do not make unsynced local data survive device loss or uninstall.

## Trips and measurement photos — September 20, 2026

Implemented and deployed the account-owned Trip model and optional StrikeDipMeasurement.photoKey field to the existing master backend in us-east-2. Verified generated outputs retain the same API endpoint, Cognito pools/client, and media bucket. No existing user records were modified as part of deployment/testing.

- Existing local trips migrate into the pending upload queue. Trip names, notes, planned sites, collection status, and cloud dataset links upload/download through the normal Sync button and account subscriptions. Downloaded trips reuse their existing cloud dataset and reconstruct local planned-site placeholders.
- Trip deletion persists a cloud tombstone. Removing a trip/site never removes a collected sample waiting to upload. Pending edits survive in-flight responses; detected conflicting cloud trip versions get recovery copies. Trip/site IDs now use UUIDs for cross-device creation.
- Measurement photos use private S3 objects with an immutable ID per photo version. Existing inline photos migrate on sync. New and downloaded photos are stored in IndexedDB for offline display; expiring signed URLs are not the saved identity. Replacement/removal updates the cloud reference, and stale cached images are cleared.
- Photo migration preserves newer cloud measurement fields and deletion state. Failed uploads leave the original local photo/edit pending; failed downloads retain cloud references and report an error for retry. Account checks bind all new sync paths to the initiating account.
- The shared API includes trips in account deletion and account-change subscriptions. Build validation now rejects generated outputs missing Trip fields or measurement photoKey.

Validation: 151 automated tests passed, including simulated two-device trip/photo transfers, migration, deletion, lost responses, conflict copies, missing photos, cached offline reads, and incomplete acknowledgments. All workspace TypeScript checks and the GeoField web build/iOS asset copy passed. This is not a live two-iPhone acceptance test or an App Store release. The separate Expo client has not acquired the Capacitor trip/photo UI. Atomic simultaneous-write limitations described above remain.

Use the updated app on both devices. On the device containing existing local trips/photos, sign into their account and allow Sync to finish while connected. Then sync the other device. GitHub push and an App Store/TestFlight release are separate from this backend deployment; neither was performed for this change.

## Missing trips/photos follow-up — September 21, 2026

Read-only inspection confirmed the running iPhone 17 Pro Max simulator had the September 20 trip/photo-sync JavaScript bundle. A paginated query to the existing AppSync API, authenticated as that simulator's signed-in account, returned two active trips and 53 active measurements, with zero measurement photo references. The simulator's current account storage matched those counts. This confirms the missing records/photos had not reached that account's cloud data; it does not establish which build is installed on the original physical phone.

Additional fixes:
- Photo-only migration now validates acknowledgment against the actual payload, including newer cloud dataset/deletion state, instead of rejecting a successful upload because the older local record differs.
- A pending dataset upload no longer blocks a trip's contents from reaching another device. The trip uploads with the previously confirmed cloud link (or none yet); the local dataset assignment stays pending and a specific error reports that remaining work. The real cloud link replaces it after the dataset sync succeeds.
- Legacy trip dataset references can resolve through the matching trip's local dataset alias, while explicit unlinks stay cleared.
- Downloaded photo caches can attach to measurements with pending text edits when the photo identity and cache pointer are unchanged.
- Storage events emitted during sync no longer trigger a continuous immediate retry loop for a failed dataset link.

The original phone must run the updated app and complete Sync before device-only records/photos become downloadable elsewhere. Running Xcode on a simulator does not update the physical phone. No production record mutations, AWS deployment, GitHub push, or App Store release were performed during this follow-up diagnosis. Validation: 155 regression tests, workspace typecheck, and web build/iOS asset copy.
