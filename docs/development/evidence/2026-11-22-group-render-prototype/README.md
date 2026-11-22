# Group CSS prototype — not for production

2026-11-22. Isolated browser-only CSS/DOM overrides against port 3594's synthetic 10k Group fixture. No API writes, database changes, or product code changes. 1440×1000 light, Playwright Chromium, one sample per variant; diagnostic, not a performance guarantee. The same long title was injected into ticket 1008 (near top), 6000 (middle), and 11000 (last).

| Variant | First rows | Initial scrollHeight | After middle | After bottom |
| --- | --- | --- | --- | --- |
| baseline | 4127.5ms | 640314px | 640314px | 640314px |
| contain:layout style | 4124.6ms | 640314px | 640314px | 640314px |
| content-visibility:auto | 2743.3ms | 640077px | 640195px | 640314px |

The auto variant uses intrinsic 52px per standalone family and 104px for a family with one child. These are deliberately limited estimates, not a general family-height solution. It reduced observed initial work but the content height grew by 237px as offscreen long rows became visible. After one scroll-to-bottom command the auto viewport was still 119px short of its new bottom. Focusing the last ticket additionally changed scrollTop by 41px (639314→639355). Baseline and layout/style containment had stable content heights. This fails the product's layout-stability expectation. Do not adopt this CSS-only estimate as the fix.

With only short offscreen rows, estimates happened to match and the auto variant looked stable (`short-offscreen-results.json`); that was not sufficient evidence. The long-row test exposes the problem. Parent/child structure from the fixture is retained, but arbitrary multi-child counts, narrow widths, zoom, browser-find, full Tab traversal and screen readers remain unverified. Last-ticket programmatic focus worked; this does not prove those other operations. All ticket DOM remains mounted; HTML parse cost and memory usage remain.

Recommended next production work remains separating Group controls/form updates from unchanged ticket DOM. Initial-display work needs a richer prototype with measured variable heights and stable anchoring, or an explicitly reviewed row-layout decision. Plain layout/style containment produced no meaningful gain in this probe.

Files: `probe.mjs`, `results.json`, initial/returned screenshots for three variants. The script can be rerun from repository root; it never modifies persistent fixture data.

## Source and relationship to #1514

This exploratory probe used the #1512 hierarchy-rendering candidate served at port 3594 (`91bfcadba88a816a499a57844b608d8c1f66b124`), before integrating the #1511 creation shortcuts. It is supporting evidence for rejecting a quick CSS-only approach, not the baseline or measured gain of #1514. The #1514 interaction benchmark uses the separately recorded PR #32/#33 integration baseline and its own comparable data.
