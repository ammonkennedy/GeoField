# Sample field-readiness audit — November 11, 2026

Scope: shared Capacitor app sample entry, water fields, local sample queue and
cache, account scoping, attachment storage/upload, cloud CRUD, sync acknowledgment,
conflicts, deletion/restore, project links, and sample export paths.

## Corrections

- Opening a cloud sample ID now loads its pending local edit first.
- Saving an open offline sheet after it syncs targets the saved cloud record.
  If that record cannot be found, the edit is preserved as a recovery sample.
- Stale sheets cannot overwrite a newer queued edit or queued deletion.
- Sample drafts remain bound to the account in which they were opened; attachment
  hydration checks the current sheet/account before updating the form.
- Save stays disabled throughout asynchronous submission.
- Cloud sample updates from the sync queue enforce the original updatedAt revision
  at the server write, closing the gap between checking and writing. A rejected
  write remains pending; a subsequent sync can preserve a conflict recovery copy.
- Malformed cloud fields fail explicitly instead of becoming an empty editable
  sample that could overwrite the original data.

## Verified safeguards

Samples are queued durably before the saved message. Media is stored separately
in IndexedDB before that queue commit. Failed attachment uploads leave the sample
pending. Cloud acknowledgment and durable cache writes precede removal from the
queue. Newer local edits made during upload stay pending. Stable record IDs allow
retries after lost responses. Revision conflicts preserve recovery copies.
Account-scoped storage and asynchronous account checks protect pending records.
Water values, GPS precision, zero values, custom parameters, notes and media
references are carried by the sample payload. Exports include sample values and
custom parameters; spreadsheet exports do not embed photo/video binaries.

## Validation

- All 414 repository regression tests passed.
- Added tests cover open-sheet sync races, stale edits/deletion, malformed cloud
  fields, conditional revision checks, and 120 serialized offline water samples
  with lost create responses. All 120 retained their fields and unique IDs.
- Shared-library and application TypeScript checks passed.
- Production web build and Android debug build passed.
- APK: android/app/build/outputs/apk/debug/app-debug.apk (relative to app root).
- These checks use isolated fixtures. No real sample data was deleted or changed.

## Before departure

The build has not been installed or deployed by this audit. Real-device storage,
camera/video, live AWS authorization and prolonged reconnect behavior still need
an end-to-end test with the updated app and a disposable test project:

1. Sign in online and load the intended project. Download required map coverage.
2. Enable airplane mode. Save several water samples with GPS, zero-valued readings,
   custom fields, notes and photos. Wait for each saved confirmation.
3. Close/reopen the app, confirm every sample and attachment, and edit one sample.
4. Restart the phone while still offline and verify saved records again.
5. Reconnect, let syncing finish, then open the same account on a second device.
   Compare values, project membership, attachments and counts; check for duplicates.
6. Save and open a spreadsheet export offline as a separate backup of values.

Unsaved forms are not crash-persistent drafts: tap Save Sample before leaving.
Storage is finite; retain enough device space for media. Do not uninstall or clear
app data with unsynced records. GPS reception does not provide offline map tiles.
Collection date/time is stored as entered local time, without a timezone offset;
record the local timezone in notes if cross-timezone interpretation matters.

Passing automated tests is not certification of loss-free field operation. The
physical-device/reconnect check above remains a release gate for this expedition.
