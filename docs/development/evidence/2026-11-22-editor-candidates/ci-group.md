# CI follow-up — Group keyboard readiness

Run45011651706 failed the English Group membership focus case. This change did not modify Group production code. The trace showed the second Add activation at43313.759ms, keyboard typing at43318.674ms and Enter at43325.114ms. Unlike the first Add cycle, the test did not wait for the search field to receive focus. An additional ungrouped-candidate request followed at43329.373ms; the final screenshot showed the empty form and disabled submit button.

`app-group-board.js` awaits candidate retrieval before rendering and focusing the search field. The test now waits for that observable focus after both Add activations, and for the desired candidate to be visible before choosing it with the keyboard. The Tab traversal helper requires an enabled target. It still uses Tab/Enter, does not force focus, and does not replay the action on failure.

The change only corrects test synchronization. Existing membership, parent-child persistence, cancellation and focus-return assertions remain intact. Independent review inspected the trace and the test diff. Targeted repeated results are recorded alongside this report.

Targeted verification: both languages × five repetitions, two workers, **10 passed (57.6s)**. See [ci-group.txt](ci-group.txt).
