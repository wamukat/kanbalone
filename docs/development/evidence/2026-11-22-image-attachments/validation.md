# Development validation

All checks used the isolated image-attachment worktree and synthetic data.

- Root ran `pnpm check`: OpenAPI lint, 217 unit/API tests, TypeScript build, public JavaScript type checking, and documentation build passed. This run preceded the last review fixes.
- After the shared storage-policy fix, the backup agent reran 28 affected tests (16 backup, 4 attachment, 8 upgrade comparison), build, public type checking, and documentation build successfully.
- Frontend regression testing covers creation/full/inline body and new/inline comments, image byte equality, rejected files, retry, delayed/reversed responses, discard and board switching, completed drafts, composition, and failed saves. Separate existing unsaved-edit and action-recovery tests include Japanese/English export-413 guidance. See the final frontend report below.
- The independent code reviewer reproduced and verified four corrected defects and an import rollback/retry → backup/restore integration path. See [code-review.md](code-review.md).
- The backup agent verified Docker named-volume and bind-mount upgrade/restoration, then reran the packaged CLI in the updated image. See [backup-validation.md](backup-validation.md).
- The browser evidence uses a frozen candidate source fingerprint; [the evidence index](README.md) records subsequent source differences and their verification. Original captures are unaltered.

Some early E2E runs had two 30-second action-recovery timeouts under parallel load and fixture assumptions corrected before rerun (list API omits bodyMarkdown, and the existing composer stays open after saving). Successful reruns are not presented as a first-attempt clean run. Image transfer events are synthetic. A separate text-paste regression uses Chromium Clipboard API plus a real keyboard shortcut; composition lifecycle events remain synthetic.

This is implementation verification, not a release candidate, deployment, or human acceptance. Merge requires the user's acceptance and passing Required checks.

## Final frontend regression results

All 6 image-attachment Chromium tests passed together with one worker and the unchanged default 30-second timeout (53.3 seconds total). All 10 existing unsaved-edit/action-recovery cases passed in a two-worker run with a local CLI-only 90-second allowance; the prior timed-out move cases completed in 20.0 and 20.9 seconds on rerun. No repository timeout was increased. Final TypeScript checking and diff whitespace checking passed.

An early punctuation-filename assertion exposed a real Markdown alt escaping issue, corrected using entities before the passing run. The corrected tests verify detail GET rather than expecting bodyMarkdown in the lightweight list API.

## Final layout check

The frontend agent measured 20 combinations: Japanese/English × 390/1440 px × create/full body/inline body/new comment/inline comment. Every idle-to-uploading comparison retained the feedback height and Save relative Y position (delta 0). Long filename errors expand by 17.39 px, or 34.78 px in narrow Japanese inline body/comment, so the complete file-specific retry guidance remains visible. This failure-state expansion is intentional. Raw measurements and the reproduction script are included as frontend-layout.json/.mjs.

The baseline 5ff4462 and final candidate have identical computed dark-mode colors for the existing discard heading and comment label: rgb(0,0,0) over panel rgb(23,29,25). This pre-existing contrast issue is outside the image feature changes and remains a known limitation.
