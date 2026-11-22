# Independent review — #1518

Reviewer: `1518_policy`. Reviewed policy before implementation, then independently inspected the production diff, focused tests, actual images, interaction records and performance samples. No product code was edited by the reviewer.

## Result

No remaining blocking finding for the scoped change. User acceptance and required CI checks are still separate merge requirements. This review does not authorize a release or replacement of the normal runtime.

## Source and behavior

- Full-board candidate retrieval is removed from new/detail opening. Existing selected relation chips come from the target ticket, and Blocks uses its canonical `blockedBy` response. The intentional priority/ID ordering normalization is shown in the two-ticket comparison.
- Candidates are editor-owned, complete before publication, shared between the four pickers, and do not overwrite the board's partial collection. The existing archived-inclusive paging collector and candidate filtering/order remain in use.
- Generation checks and AbortController reject obsolete responses. Closing, opening another ticket and refreshing after a save invalidate candidate data. A pending request cannot select old options with Enter or replace user inputs, focused summary chips or a closed picker.
- Ordinary creation does not wait for candidate collection. Selected relationship removal and unrelated saves preserve the remaining stored relationships. Test API reads validate persisted results.
- The defensive seed from the current TicketView before an attempted new opening retains current selected summaries if opening fails. The discarded full-page navigation test does not prove that in-place edge; it is reviewed in source only.

## Findings resolved during review

1. The first error state used two rows and moved the child row and Save/Cancel area about 32 px relative to loading. A shared fixed-height status row now keeps loading/error geometry equal.
2. At 390 px, the status grid item's automatic minimum width pushed Retry out of sight. `min-width: 0` on that item fixes overflow. The final Japanese narrow error image shows a visible Retry button, and the English/Japanese geometry records confirm it fits.
3. The initial narrow screenshots resized an already-positioned desktop dialog and therefore did not represent a valid fresh narrow opening. They were replaced with baseline/candidate captures with the viewport set before navigation.

## Evidence inspected

- Visually inspected Japanese edit before/after, desktop loading, English retry, Japanese narrow/dark search and retry, and the explicit before/after Blocks ordering pair. The final appearance retains the existing controls, surfaces and typography.
- Independently read all four final loading/error records (Japanese/English × 1440/390 px): title, search, whole relation control, adjacent child row and Save rectangles match exactly. Status scroll width equals client width, and Retry's right edge fits inside the container. Query/title retention and focus return are recorded.
- Success results retain the pre-existing variable list-height behavior. This review does **not** claim that every transition in the whole editor is layout-invariant.
- Independently read the final check log: 198 tests passed, with build/public typing/docs checks. Related browser suite: 35 passed; the additional narrow Retry geometry test: 1 passed. The earlier failed attempts and corrected/removed test assumptions are described in README rather than counted as successes.
- Recomputed all six performance medians from 72 raw observations, checked exact before/after match-ID equality per run, and verified the recorded runtime source fingerprints. At 10,000 tickets, opening improves while first relation search becomes roughly 705 ms. The report correctly describes work being deferred, not the collection volume being eliminated.
- The final CSS-only minimum-width correction occurred after the performance run. Original measured hashes and final hashes are retained separately with that exact limitation; final hashes were independently verified. Runtime JavaScript did not change after the measured version.

## Limits

Synthetic screenshots and tests do not establish human usability or all devices/network conditions. The unrelated, unreproduced 859 ms first request on the real 102-ticket board remains unexplained; this change does not claim to fix it. Related-search transfer volume remains proportional to board size and is a separate possible follow-up. Existing user data was not used for these screenshots or mutations.

## CI test-only follow-up review

The first PR CI run passed 178 browser cases and exposed two test synchronization/counting failures. Independently reviewed the two test-only diffs and downloaded Playwright trace records; no production source changed.

- Save/re-edit: the three archived-all requests were the original candidate fetch, the save's board reference refresh, and the new candidate fetch. The added archived ticket was created after the board refresh request. Checking its visibility after re-editing still proves a fresh candidate collection, while selected chips prove retained relationship state. Removing the cross-purpose global counter does not remove the dedicated exact paging/reuse count test. The amended test passed ten repetitions with two workers (53.3 s).
- Group membership focus: the implementation awaits candidate retrieval before rendering/focusing its search field. The second keyboard cycle previously typed before that focus transition completed and could activate Add again. The test now waits for actual search focus and visible candidate options, and verifies controls are enabled before traversing to them. It still reaches controls by Tab/Enter, does not force focus or retry keys, and retains API checks for parent/child membership and cancellation. Both language cases passed ten total repetitions with two workers (57.6 s).

These corrections preserve the behavioral contracts being tested. The new remote CI run remains a separate required gate; the local repetition results are not substituted for it. Earlier screenshot and performance evidence remains applicable because production code is unchanged.
