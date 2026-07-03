# GeoField

GeoField is a geological field-data collection app for recording samples, field notes, GPS locations, photos, maps, and exports.

The project contains:

- A web app for datasets, sample entry, maps, exports, subscription screens, and offline queueing.
- A mobile app for field capture, GPS, photos, compass/strike-dip, maps, and stratigraphy notes.
- A backend/API layer for authenticated folders and samples.
- Shared database, API specification, and generated client packages.

## Current Field Workflow

GeoField is aimed at field geologists and geo developers who need to collect structured observations in rough conditions.

Supported sample categories:

- Water
- Rock
- Soil / sediment
- Other field material

Useful current capabilities:

- Record sample IDs, sample type, notes, and custom parameters.
- Capture GPS coordinates and show map markers.
- Store photos/videos locally with sample records.
- Queue samples while offline.
- Organize samples into datasets.
- View geology, soil, trail, satellite, and street map layers in the web app.
- Export sample data for analysis and reporting.

## Important Product Notes

Offline capture exists, but media cloud sync is not complete yet. Photos and videos are stored on the device until a full upload/sync pipeline is added.

The web app and mobile app share the same product direction, but the mobile app is still mostly local-first. The next major product step is to make mobile collection and web review use the same synced dataset everywhere.

## Recommended Roadmap

1. Make save/sync behavior dependable before adding more field tools.
2. Keep sample types and dataset rules consistent across web, mobile, API, and database.
3. Show clear sample states: saved on this device, waiting to sync, synced, and sync failed.
4. Unify web and mobile data so field collection, review, and export use the same records.
5. Add stronger geology templates for lithology, grain size, weathering, alteration, mineralization, strat position, and collection purpose.
6. Make maps a central field workspace with better filtering, clustering, imported boundaries, and offline map support.
7. Add pre-export quality checks for missing coordinates, duplicate IDs, missing dates, unexpected units, and incomplete fields.
8. Add tests for save, sync, export, auth, and dataset ownership.
9. Add a real media upload pipeline for photos/videos.
10. Improve onboarding and documentation for non-developer field users.
