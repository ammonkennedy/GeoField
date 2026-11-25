import assert from "node:assert/strict";
import test from "node:test";
import { validateProjectBundle } from "./project-transfer-format.ts";

const validBundle = () => ({
  kind: "geofield-project",
  version: 1,
  exportedAt: "2026-11-25T12:00:00.000Z",
  project: { name: "Granite Ridge", description: "North traverse" },
  samples: [{ sourceRecordId: "sample-source-1", sampleType: "rock", sampleId: "R-17", fields: { media: [{ shareMediaId: "photo-1" }] } }],
  measurements: [{ sourceRecordId: "measurement-source-1", label: "Plane 1", photoMediaId: "photo-1" }],
  tracks: [],
  trips: [],
  stereonets: [],
  media: [{ id: "photo-1", kind: "photo", fileName: "outcrop.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/2Q==" }],
});

test("validates complete project packages with attachment references", () => {
  const bundle = validBundle();
  assert.equal(validateProjectBundle(bundle), bundle);
});

test("rejects unsupported package versions", () => {
  assert.throws(() => validateProjectBundle({ ...validBundle(), version: 2 }), /not a supported GeoField project share/);
});

test("rejects sample attachments missing from the package", () => {
  const bundle = validBundle();
  bundle.samples[0].fields.media[0].shareMediaId = "missing";
  assert.throws(() => validateProjectBundle(bundle), /sample attachment is missing/);
});

test("rejects duplicate or malformed media records before import", () => {
  const bundle = validBundle();
  bundle.media.push({ ...bundle.media[0] });
  assert.throws(() => validateProjectBundle(bundle), /attachment could not be verified/);
  const malformed = validBundle();
  malformed.media[0].dataUrl = "https://example.test/photo.jpg";
  assert.throws(() => validateProjectBundle(malformed), /attachment could not be verified/);
});
