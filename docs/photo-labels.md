# Photo labels

The shared LabeledPhoto viewer is used by sample photos, strike/dip and lineation
photos, and field-note photos. Opening a photo shows a Label button at the bottom.
The editor accepts up to 2,000 characters. Saving an empty label removes it.
A two-line preview overlays the image bottom; tapping it opens the entire label
in the scrollable viewer. Text is rendered as text, never HTML. Originals are not
modified or stamped; downloading the original photo still gives the original.

Note and measurement labels save immediately. Sample labels are part of the
sample form draft, committed by Save Sample / Update Sample; the viewer explicitly
explains this after editing. Replacing a photo clears its old label. Map sample
photo previews open the associated sample viewer and can open the full caption
through a deep link. Photo thumbnails in measurement row headers also open the
viewer instead of just expanding the measurement sheet.

Sample media and NotePhoto metadata carry an optional `caption`. Media upload
and cache paths preserve it. Note sync acknowledgement compares captions, so a
response that drops the label cannot clear its pending revision. Measurement
photos use the optional `StrikeDipMeasurement.photoCaption` backend field.

## Deployment

Deploy the updated Amplify schema before releasing measurement-label syncing.
This can be deployed with the pending NoteFolder schema from the previous change.
Measurement operations select photoCaption explicitly, independent of stale
local generated outputs. On a backend lacking the field, ordinary reads/writes
without labels retry using the original selection, while labeled measurements
remain pending with a server-update message. Refresh deployment outputs before
the native release as usual. No live AWS deployment or App Store submission is
performed by this change.

## Validation

Automated tests check caption preservation during note and measurement photo
upload/cache, rejection of incomplete cloud acknowledgements, and old-backend
fallback without discarding labels. Isolated offline browser checks cover saving
and rereading labels for notes, lineation and samples, the two-line limit, full
text display, sample viewer deep links and phone-sized layout. Live AWS sync and
physical iPhone verification must follow deployment.
