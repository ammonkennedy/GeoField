# Google Earth handoff

Map View's **Open in Google Earth** creates a KML snapshot of the selected
samples (including future sites), measurements, and saved tracks currently
eligible for display. Selection includes points outside the current viewport.
Hiking Trails and Tracks includes all saved tracks, matching that overlay.
GPS recording gaps remain separate line segments.

Native builds offer the existing file-opener chooser with a local cache file;
select Google Earth if installed and registered for KML. If opening fails, the
existing export/save flow is used. Web builds download KML and provide a Google
Earth link for manual import. A guaranteed one-click import is not available
across browsers and operating systems. No public hosting or cloud upload is
introduced by this feature.

The snapshot includes names, coordinates, sample notes and measurement readings.
It does not include photos, background tiles, external overlay services, or
live synchronization. Treat exported notes as part of the shared file.

Validation: KML tests cover coordinate order, XML escaping, colors, recording
gaps, single-point routes and invalid/empty inputs. Shared-app typecheck and
build passed. Native Google Earth handoff still needs testing on physical iOS
and Android devices; local checks do not establish app registration/import.
