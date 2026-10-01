# Note folders

Notes has a Create folder button above All Notes. Each folder supports Add notes
(multiple existing notes) and Create note. Notes remain in All Notes and may
belong to more than one folder. Remove from folder changes membership only;
text, photos, deletion state and creation date remain unchanged. Lists use
creation time descending with an ID tie-breaker, never titles or edit times.

Folders use durable, account-scoped local storage and the separate owner-only
Amplify `NoteFolder` model. Membership is a list of note IDs, so older clients
continue seeing ordinary notes and do not mistake folders for empty notes.
Empty folders sync. Deleted notes retain their memberships for restoration.

Sync uses the same acknowledgement/conflict recovery engine as notes through a
folder adapter. Concurrent changes preserve the other version as a recovery
folder; memberships are never inferred from a potentially incomplete note list.
Cloud and local writes are separate for new notes: if adding a newly created
note to a folder fails, the note remains in All Notes and the UI reports it.
Folder failure does not prevent the independent notes/photos sync from running.

## Release dependency

Deploy `amplify/data/resource.ts` with the new `NoteFolder` model **before** shipping
the updated website/native client. `amplify.yml` already deploys the backend
before the frontend build. Refresh local `amplify_outputs.json` from that
deployment before building the release in Xcode so generated subscriptions also
include NoteFolder. Do not manually label local outputs as deployed.

Folder CRUD uses explicit, account-token-bound GraphQL operations and does not
require fabricated local model introspection. If the backend has not been
updated, synchronization reports the server update requirement and retains all
pending folders. This change does not deploy AWS or submit a new App Store build.

## Checks

- Storage tests cover account isolation, durable empty folders, deduplicated
  membership, invalid selections, and removal without modifying note data.
- Sync tests simulate a second device, unacknowledged membership, an edit during
  upload, and recovery of conflicting membership.
- Browser checks use an isolated offline account to create folders, select
  existing notes, create inside folders, preserve creation ordering after edits,
  remove membership without deleting notes, reload and use the mobile dialog.
- Live AWS two-device verification must follow backend deployment.
