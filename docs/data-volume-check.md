# Data volume check

Tested locally on 2026-09-22 using generated records only. No real account or AWS data was created or changed.

## Browser observations

Headless desktop Chromium, 390 × 844 viewport, local production preview; a phone-sized viewport is not iPhone hardware. Timings are single-run observations, not performance guarantees. No photos were attached.

| Records across 20 datasets | Sample page | Search | Measurements page | Open sheet |
| --- | ---: | ---: | ---: | ---: |
| 500 samples + 500 measurements | 773 ms | 44 ms | 223 ms | 182 ms |
| 1,000 samples + 1,000 measurements | 1,095 ms | 53 ms | 336 ms | 609 ms |

Both cases survived reload and produced no JavaScript errors. The larger measurements view contained 21,396 DOM elements; it renders every row. A repeat of the larger test opened a sheet in 507 ms. Its map created all 2,000 markers in 591 ms. This does not establish sustained map frame rate or physical-device memory behavior.

Generated records occupied approximately 1,845,044 bytes of UTF-16 localStorage values before duplicating all collections into durability backups. Text length, backup copies, and attachments affect storage requirements; this is not a maximum supported record count.

## Repeatable integrity checks

Run `node --test artifacts/geofield/tests/data-volume.test.ts`.

- Export 1,000 samples and 1,001 measurements across 20 datasets; serialize and reopen XLSX; verify every measurement's custom fields and dataset. Workbook creation plus reopening took about 135 ms and produced an approximately 997 KB workbook.
- Sync 1,001 measurements through an in-memory simulated cloud, fail one middle upload, retry, verify exactly 1,001 successful writes and all records on a simulated second device.
- Upload 1,000 queued samples, interrupt at 500, verify the remaining queue, retry, and verify cache-before-removal, all dataset links, and no duplicates.

Simulated measurement sync took about 3.65 seconds without network latency. This tests the sync algorithm, not AWS throughput or real device-to-device behavior. Source review confirmed both AWS sample and measurement download loops follow nextToken; their limit of 1,000 is a page size, not a total limit. Live AWS pagination was not exercised.

## Scaling concerns

- All measurement rows and sample cards are mounted at once; pagination or virtualization is the main next UI optimization.
- Maps use individual DOM markers rather than clustered map layers; 2,000 markers loaded, but pan/zoom performance needs device testing.
- Record uploads are sequential, so a large initial sync may take considerably longer on mobile networks.
- Per-record durable acknowledgements read/write full collections. Keeping acknowledgements durable is essential, but moving collections to transactional per-record storage would reduce repeated work at larger volumes.
- Physical iPhone performance, photo-heavy workloads, device storage exhaustion, live AWS throttling, and real network interruptions remain untested by this check.
