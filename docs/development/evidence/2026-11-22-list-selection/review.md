# Independent review of List selection

[Implementation PR](https://github.com/wamukat/kanbalone/pull/39)

Independent review. Baseline: `963b37bcdd5e773ef01889bbcea9dbd33a21d1bd`.

## Result

No source, measurement or image-evidence blocker found. This review does not replace user acceptance or required CI. The related browser suite completed successfully: 49 passed (5.0m), independently confirmed from the final log.

## Source and behavior

Reviewed all three production-module changes. Temporary Sets replace repeated membership scans; the ordered selection array remains the source of truth and is still pruned against the current filtered collection. Sets are rebuilt synchronously for each operation/render, so this change adds no stale-selection cache. The selected-ticket traversal and bulk-write payload order remain unchanged. Bulk-move lane selection, family selection and empty/partial/all-selected states keep their prior semantics. No CSS, API, storage or virtualization change is introduced.

The new 240-ticket browser regression crosses the 200-item API page boundary and the virtual-row boundary, verifies selection at the bottom, partial/all selection, filtering, live lane movement and the exact bulk-archive payload. It independently reads saved tickets to ensure excluded tickets are not archived. Existing parent/child, move and keyboard suites supply additional interaction coverage.

## Measurement audit

Independently recomputed the medians from all 24 raw observations / 96 operations, excluding the documented warm-ups. Checked the frozen baseline module bytes against git and candidate bytes against the current production files, including all recorded source hashes. Both variants use the same three URL overrides; execution alternates before/after order.

At exactly 10,005 tickets, select-all is **907.0 → 105.6 ms**, deselect-one **556.3 → 44.6 ms**, and select-all-again **445.9 → 44.6 ms**. Clear-all **40.2 → 43.1 ms** is not an improvement. At 1,005 tickets select-all is **119.1 → 92.2 ms**. Raw mounted-checkbox states, selected counts, checked/indeterminate states, 6/51 initial API pages and 64×N scroll heights are consistent.

The timing boundary is capture-phase `change` through two animation frames, not complete pointer latency, INP, initial display or API latency. The report states these limits and separates the earlier prototype. Bulk-move and family-selection paths are functionally checked, not covered by these performance numbers.

## Actual UI and persistence evidence

Directly inspected the Japanese full-selection before/after images, English partial selection, Japanese filtered selection and English narrow/dark view. Independently compared all ten before/after PNG pairs: they are byte-identical. Both language records are also exactly equal between variants. Existing narrow horizontal overflow is preserved; these images do not establish a new responsive design.

Reviewed the actual capture script and recorded requests/GET/reload assertions. Each of the four language/variant flows starts with 240 tickets, deselects one, filters to a lane, archives exactly 119 IDs, verifies those IDs through the API, and reloads to the one excluded ticket. The synthetic fixture is separate from existing user data. Screenshots establish appearance; persistence is supported by the recorded API assertions, not inferred from pixels.

Full check log confirms 198 tests passed, zero failed, followed by successful build, public-JavaScript checking and docs generation. The final related browser log confirms all 49 cases passed (5.0m), including the new 240-ticket regression, parent/child selection, bulk moves, filters, preferences and keyboard behavior.

## Scope boundary

This review covers the List selection improvement. Large Group DOM/layout work and first relation-search collection remain. The older Group rendering measurements must not be presented as a fresh benchmark of this baseline. Group virtualization/progressive display should be considered separately with explicit decisions on variable-height titles, parent/child context, scroll stability, keyboard navigation and browser text search; it is not a low-risk extension of this Set-only patch.
