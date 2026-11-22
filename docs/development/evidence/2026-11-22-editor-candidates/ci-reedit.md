# CI follow-up: save and re-edit assertion

CI run [45011651706](https://github.com/wamukat/kanbalone/actions/runs/45011651706), Chromium E2E job 137175079086, reported `Expected: 2 / Received: 3` for the save/re-edit candidate test. The new candidate was visible and both previously selected relations were retained; only the global request-count assertion failed.

The downloaded Playwright trace establishes this order ([extracted network records](ci-reedit-network.json)):

- 10:18:01.120Z: initial candidate search fetches the complete collection.
- 10:18:01.330Z: saving refreshes board detail and fetches its reference collection through the same archived-all endpoint.
- 10:18:01.336Z: the test API creates a new archived candidate.
- 10:18:01.403Z: the next editor search fetches candidates again, displaying the newly created ticket.

The test had waited for editor `inert=false` and `networkidle`, but the request observer's count did not form a reliable boundary: the save refresh request was delivered to the observer after that sample. It was not an extra picker fetch and was not evidence of failed cache invalidation.

The test now checks the actual invalidation contract: a ticket created **after** the original candidate collection appears when re-editing, while the two selected relation chips survive. The fresh ticket cannot come from the prior cached collection. The separate complete-pagination test continues to assert exactly two requests for its two pages and zero extra requests when searching the ready collection again.

No runtime code, screenshot or performance result changes. [Targeted test repetitions](ci-reedit.txt): **10 passed (53.3s)** using two workers. The independent reviewer checked the CI trace chronology and approved the corrected assertion; the dedicated request-count regression is unchanged.
