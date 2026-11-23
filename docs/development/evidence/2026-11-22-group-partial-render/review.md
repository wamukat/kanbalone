# Independent review of Group partial rendering

[Implementation PR](https://github.com/wamukat/kanbalone/pull/34)

Reviewed independently of the implementation and evidence authors. Baseline: `2c44327c1b05753b165181ee663af9fb5253e40f` (local integration of PR #32 and #33). Status: no remaining blocking finding in the reviewed local implementation and evidence. Final source fingerprint: `c899de5b195e89d295cb9164238bec89ec1bc8b58c7a46918674d4eb1f6ad3d3`; independently checked all four file hashes against `revision.json`.

## Strategy and invalidation

Reviewed the four changed production files. The Group host keeps separate list, header/form, ticket and footer sections. Unchanged ticket nodes remain connected while smaller controls/forms update. A render-specific ticket revision changes when the received ordered collection changes any row-relevant field: ID, title, lane, parent, has-children flag, priority, resolved or archived state. The render key additionally includes board, selected Group, archive visibility, locale, lane names and the empty-state distinction. The default Group comparator is priority then ID; position is not a direct row-order input. New API objects replace the collection even when rendered fields match, so action data is not frozen by the view cache.

The existing `renderGroupView` string renderer remains available with equivalent output. Hierarchy indexing is lazy when tickets are deliberately omitted. Busy removal actions are synchronized on retained nodes; section references are rebuilt if the board host is replaced. No API contract, visible ticket limit, sorting rule or storage format changes.

The new `.group-render-section { display: contents; }` rule makes neutral div boundaries layout-transparent. This is a small CSS addition, not literally a zero-CSS diff. Existing presentation tokens and styles remain unchanged. Reviewed current CSS/tests for selectors depending on direct content-panel children; no conflicting selector was found. Actual screenshot parity and browser checks are required in addition to that static observation.

## Review finding and fix

The first partial-render draft could keep a submit button disabled after a failed save: submission changed the DOM property directly, while the cached pre-submit HTML could compare equal after `busy` returned to false. The author invalidates the affected form section cache before the direct change, so completion/failure recomputes that form's button state. Create/rename form HTML also reflects busy state for intervening renders. The final E2E cases cover failure → draft preservation → retry for description and Group creation forms. Row-action busy synchronization alone would have been insufficient.

## Preservation checks

The review covers state freshness after SSE, archive and parent/child changes, priority sorting, lane rename, selected Group/board changes, focused title restoration after keyboard creation, description caret/drafts, scroll, and pending-write controls. Section caching must not be accepted merely because steady-state images look identical. Initial rendering and full API collection still occur; interaction timing claims must be scoped to the measured control/form operations rather than presented as a first-load improvement.

## Browser and image evidence

Independently operated the isolated Japanese candidate fixture through description edit, unsaved preview and cancel. The original ticket row stayed connected and identical throughout; cancel restored the description action focus. Switching to the other Group disconnected the old row and showed the correct current ticket. N opened creation with that Group in its context, and Escape returned focus to the originating ticket. This reviewer did not persist fixture changes.

Inspected the Japanese candidate-selection and English description-preview before/after images and the supplementary dark/mobile captures. Existing white surfaces, status/lane alignment, hierarchy and control placement remain consistent. The decoded-pixel report covers all ten comparable pairs: four exact matches and six with only 1–21 differing pixels around controls/caret. This is unchanged-layout evidence, not proof of speed or comprehensive accessibility. No screenshot was altered to hide differences.

Checked both language sequences in the verification JSON: all five candidate row-retention checks are true, all corresponding baseline checks are false. Saved Markdown descriptions and candidate memberships match the intended Group; reload persistence and unchanged original tickets are recorded. These stored-result checks supplement the screenshots.

## Performance and regression assessment

Independently recomputed all 24 action/size/phase medians from the 72 raw samples; they match `performance.md`. The six measured control operations drop from approximately 337–427 ms to 31–42 ms at 1,000 members, and 3,886–4,157 ms to 313–360 ms at 10,000 members. Every candidate sample retains its representative original row and expected row count; baseline samples replace it. Measurements are three repetitions per action on one local environment, sequential before/after, from click dispatch to two animation frames. They exclude driver waiting and initial loading and are not field INP measurements. Initial loading and the full ticket DOM remain limitations.

Reviewed the final successful logs: `pnpm check` includes 196 unit/API tests plus lint/type/document checks; 49 affected E2E tests passed. Cases include cache invalidation for title, hierarchy, priority, completion, archive, lane names and membership, delayed-write busy controls, failed-save retry, live-update caret/scroll preservation and keyboard creation focus recovery. [PR #33](https://github.com/wamukat/kanbalone/pull/33) Tests were run by the separate verification agent, not rerun by this reviewer.

## Decision and limits

No remaining blocker found for this bounded partial-render change. The observed retry bug is fixed and regression-covered. The change preserves the existing interaction model while avoiding unrelated row replacement; it does not establish first-load scalability, real OS IME behavior, screen-reader compatibility or user-study results. User acceptance and passing Required checks remain necessary before merging. No production data, release or runtime update is authorized by this review.
