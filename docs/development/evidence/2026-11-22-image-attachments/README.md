# Image attachment evidence

[Implementation PR](https://github.com/wamukat/kanbalone/pull/45)

Captured on November 22, 2026 (JST). The baseline is Kanbalone v1.0.0 at `5ff44622f74c2116147d60c11be7f86fbc2208d2`, extracted with `git archive`. The candidate is the source snapshot identified by [source-fingerprint.json](source-fingerprint.json). The manifest hashes the API, frontend and package inputs for each runtime. The [before](before-results.json) and [after](after-results.json) records include the browser version and observed values.

The comparison uses four settings at device scale 1. Each setting has a separate loopback app and disposable SQLite database. Both phases seed the same two-lane board, one ticket with Markdown details, and one comment for the selected language. No user data was used. A pre-save edit screenshot follows the same input gesture in each pair.

| Settings | Ticket creation, inline body and inline comment | Full ticket edit and new comment |
| --- | --- | --- |
| Japanese, 1440 × 900 light | Drop | Paste |
| Japanese, 390 × 844 dark | Drop | Paste |
| English, 1440 × 900 light | Paste | Drop |
| English, 390 × 844 dark | Paste | Drop |

## Reproduction and observations

1. Open the new ticket editor and enter the fixture title and body, or open the seeded ticket and enter full or inline body edit. For comments, open the composer or choose Edit from the existing comment's actions.
2. Put the caret at the end of the draft. Dispatch a file `Drop` or `Paste` event with a synthetic 560 × 132 PNG. The baseline should retain the draft text and produce no attachment request. The candidate should consume the event, POST the PNG, and insert an image reference at the caret while retaining the existing text.
3. Save through the applicable UI control. Check the stored Markdown with a ticket or comment GET. Reopen the newly created ticket from a fresh document, or reload the edited ticket route. Check that the image DOM element has decoded with natural dimensions 560 × 132 and stays within the viewport. Fetch the attachment URL separately and compare its media type, size, and SHA-256 with the original input file. The baseline should have no rendered images.
4. In the candidate's Japanese wide and English narrow cases, upload an image in inline body edit, select Cancel, and confirm that the draft should be discarded. The persisted ticket body and the reloaded detail should match the original. Check the attachment URL independently to distinguish the stored draft reference from the uploaded blob.
5. In the same two candidate settings, insert an image into the new comment composer and the seeded comment editor. Use the ticket header Edit button to open the unsaved changes prompt. Cancel once and check the draft stays intact. Open the prompt again and discard. Confirm the new comment was never saved and the existing comment remains at its previous saved revision.
6. In the same two candidate settings, return an injected HTTP 503 for the next upload. Check that the upload error explains the next action, the draft is intact, and ticket GET still returns the original Markdown.

## Verified results

All 20 editor and viewport paths retained the original text in the baseline without an attachment request. The same 20 paths in the candidate consumed the file event, stored the Markdown reference through the regular Save action, and rendered the image on a fresh document load. All 20 attachment GET responses matched the input MIME type, byte count, and SHA-256. The image rendered at 560 × 132 CSS px in the wide viewport and approximately 300 × 71 CSS px in the narrow viewport.

In both discard runs, cancelling the comment prompt preserved the full draft, and confirming discard preserved the previous stored state. Discarding an inline body draft left the stored body unchanged and the independently uploaded blob readable. In both injected-503 runs, the UI showed retry guidance and preserved both the draft text and the stored ticket body.

## Capture version and subsequent changes

The first candidate check found a 560 px source image could extend beyond the editor at 390 px. The captured candidate adds responsive Markdown image sizing. The reloaded image bounds and downloaded byte hashes verify that display sizing leaves the PNG payload unchanged.

[Working-tree comparison](working-tree-comparison.json) records changes after the capture source was frozen. The later selection rebasing applies when text is changed during an upload. The later comment-save guard applies when a comment save request is still pending. The shared image policy keeps the format list and byte limit used by these captures. The capture runner completes each upload before it checks the draft or saves and finishes save before post-save navigation. Those pending-request paths are covered separately in browser tests. A later CSS change reserves the hint space for upload progress. The final fingerprint and the focused captures below cover that visible state.

## Capture files

All files in [captures](captures/) are original viewport screenshots. Names contain the phase, locale, theme, width, and editor state. The `reloaded` files show the saved detail after a new document load. The two `ticket-cancel` files show the inserted Markdown before cancelling. The persisted outcome appears in the candidate JSON under `ticket-cancel`. The `discard-prompt` images show the unsaved changes dialog triggered after comment uploads complete. The `ticket-upload-failure` images accompany the injected 503 records.

| Representative pair | Before | After |
| --- | --- | --- |
| Ticket creation after drop, Japanese wide light | [Editor](captures/before-ja-light-1440-ticket-creation.png) | [Editor](captures/after-ja-light-1440-ticket-creation.png) |
| Saved ticket from fresh document, Japanese wide light | [Detail](captures/before-ja-light-1440-ticket-creation-reloaded.png) | [Detail](captures/after-ja-light-1440-ticket-creation-reloaded.png) |
| Full ticket edit after paste, Japanese narrow dark | [Editor](captures/before-ja-dark-390-ticket-full-edit.png) | [Editor](captures/after-ja-dark-390-ticket-full-edit.png) |
| Inline ticket body after paste, English narrow dark | [Editor](captures/before-en-dark-390-ticket-inline-edit.png) | [Editor](captures/after-en-dark-390-ticket-inline-edit.png) |
| New comment after drop, English narrow dark | [Composer](captures/before-en-dark-390-comment-creation.png) | [Composer](captures/after-en-dark-390-comment-creation.png) |
| Saved new comment after reload, English narrow dark | [Detail](captures/before-en-dark-390-comment-creation-reloaded.png) | [Detail](captures/after-en-dark-390-comment-creation-reloaded.png) |
| Inline comment after paste, English wide light | [Editor](captures/before-en-light-1440-comment-inline-edit.png) | [Editor](captures/after-en-light-1440-comment-inline-edit.png) |
| Saved inline comment after reload, Japanese wide light | [Detail](captures/before-ja-light-1440-comment-inline-edit-reloaded.png) | [Detail](captures/after-ja-light-1440-comment-inline-edit-reloaded.png) |

## Upload progress on the final source

[Final source fingerprint](final-source-fingerprint.json) identifies the two 390 × 844 dark-mode runs. The harness paused the real upload request at the server until each progress screenshot was taken. The textarea and Save button had identical positions and dimensions before the event, during the localized upload status, and after Markdown insertion in both languages. The Save button stayed at y = 674.17 CSS px. Both requests then returned HTTP 201. [Raw measurements](final-after-results.json)

| State | Japanese narrow | English narrow |
| --- | --- | --- |
| During the held upload | [Uploading](captures/final-after-ja-dark-390-ticket-creation-uploading.png) | [Uploading](captures/final-after-en-dark-390-ticket-creation-uploading.png) |
| After Markdown insertion | [Draft](captures/final-after-ja-dark-390-ticket-creation.png) | [Draft](captures/final-after-en-dark-390-ticket-creation.png) |

## Run the capture

From the repository root with Node 26, repository dependencies and agent-browser's Chromium installed, extract and link the baseline once. Captures run against fresh fixtures. Set `KANBALONE_IMAGE_EVIDENCE_CANDIDATE_ROOT` to run the candidate from a separate source snapshot with its own `node_modules` link. The default is the current working tree.

```sh
baseline=5ff44622f74c2116147d60c11be7f86fbc2208d2
fixture_root=coverage/image-evidence/baseline-source
evidence=docs/development/evidence/2026-11-22-image-attachments
mkdir -p "$fixture_root"
git archive "$baseline" src public package.json tsconfig.json pnpm-lock.yaml | tar -x -C "$fixture_root"
ln -s "$PWD/node_modules" "$fixture_root/node_modules"
node "$evidence/fingerprint.mjs" > "$evidence/source-fingerprint.json"
node --import tsx "$evidence/capture.mjs" before
node --import tsx "$evidence/capture.mjs" after

# Use the final source for the upload progress check.
node "$evidence/fingerprint.mjs" > "$evidence/final-source-fingerprint.json"
node --import tsx "$evidence/capture.mjs" final-after
```

Verify the checked-in artifacts with `shasum -a 256 -c SHA256SUMS` from the evidence directory. Capture output can differ with the browser, host fonts, and fixture timestamps.

## Limits

The browser receives synthetic `DataTransfer` and `ClipboardEvent` payloads, with real app handlers, HTTP routes, storage, rendering, and save interactions. This does not exercise the operating system's clipboard or Finder, browser file drag behavior outside the textarea, or a physical touch device. The image fixture uses a PNG. Separate API and browser tests cover other formats and the pending-upload behavior. This comparison uses two representative viewport and theme combinations per language. The evidence does not measure network latency or replace human usability review. Dark mode has low contrast on the existing comment label and discard-dialog heading. The independent review records the affected frames. The app instances are disposable. Only the captured screenshots are needed to view these records.
