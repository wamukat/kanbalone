# API and browser comparison archive — 2026-11-22

[Report (Japanese)](../../../ja/developer/api-ui-performance-comparison.md) · [Environment from the same study](../2026-11-22-product-comparison/environment.json)

This is a historical comparison using synthetic data, including Kanbalone v1.0.0, Kanboard v1.2.58 and Vikunja 2.8.0. It is not a measurement of current main, a product ranking, or before/after evidence for a fix. The documentation review on 2026-11-28 did not rerun the experiment.

## Contents and interpretation

- `api-benchmark.json`: 100 synthetic tasks per product; three warmups and 30 measured requests per operation, rotating product order, no concurrency. The timer ends after the complete HTTP response body, before JSON parsing. Vikunja's recorded list result combines two sequential pages to reach 100 tasks. The file includes all 360 measured samples and their summaries.
- `browser-observations.json`: one exploratory observation per product. Kanboard used destination DOMContentLoaded; the other two used a matching heading plus two animation frames. These are different endpoints, not INP or a comparable latency distribution.
- `gui-save-readback.json`: selected API readbacks after a GUI body edit. Fixture strings describe synthetic work, not actual implementation or human research participants.
- PNG files: the observed board/detail/edit views. All seven originals are 1280×844 pixels, light theme. The different application views do not establish visual or performance superiority.
- `benchmark.py.txt` and `observe-detail.js.txt`: unchanged historical source excerpts, archived as text. They are not supported executable tools. The benchmark depends on an omitted private `api` adapter and authentication files, creates fixtures and performs writes; the browser snippet assumes a particular synthetic title and page context. Do not run them against an existing environment. A new benchmark requires an independently prepared disposable setup and explicit endpoints/credentials.

## Limits and provenance

The original private adapter and authentication artifacts are deliberately not distributed. The historical experiment cannot be replayed from these excerpts alone. Container tags and local image IDs are recorded, but exact browser, automation and host versions were not recorded in these artifacts. During the document review, repository tag `v1.0.0` was checked and resolves to `0bf19d1b21536457e503068c7b6d2340e93b30e3`. This retrospective tag lookup supplements the tested image identity; the measurement JSON itself does not contain a source-commit field.

The PNG/JSON files and source excerpts are byte-for-byte preserved from the uncommitted artifacts reviewed on 2026-11-28. [SHA256SUMS](SHA256SUMS) records the publication-time integrity of those artifacts, not independent capture-time proof. Localhost URLs and synthetic IDs in the records identify disposable fixtures, not an accessible external service. No private credentials or user work are included.

For current implementation progress and remaining validation, see the [updated roadmap](../../../ja/developer/improvement-roadmap.md) and [current user guide](../../../en/user-guide.md). The 2026-11-28 document review recomputed sample counts, median, nearest-rank p95 and maximum from the 360 stored samples; all 12 summary rows matched. This checks arithmetic only, not the measurement setup. No new speed, usability or reliability claim follows from publishing this archive.
