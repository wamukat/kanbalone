# UI/UX changes

For each UI/UX ticket, capture and attach before-and-after screenshot evidence before moving it to Acceptance or marking it complete. Follow [the UI/UX review rules](docs/development/ui-ux-review.md#per-ticket-image-evidence-required).

Use comparable task data, viewport, theme, and UI state. Record versions, reproduction steps, expected/observed results, and limitations. For interaction bugs, include the relevant sequence and verify stored results; a single screenshot is not proof of persistence or timing. If a before state cannot be reproduced, state the reason instead of fabricating it. Keep existing user data separate from evaluation fixtures.

# Development and release workflow

Follow the team rules in [the release guide](docs/en/developer/release.md#team-operating-rules) ([日本語](docs/ja/developer/release.md)). Use short-lived branches and reviewed PRs for all changes. Require user acceptance in chat and passing Required checks before merging; the agent may perform the merge on the user’s behalf. GitHub approval counts are not required. Reconfirm acceptance if the accepted content changes; do not use administrator bypass for routine work. Complete bilingual release notes before merging the release preparation PR, record local candidate verification after dry-run, and publish only within the user's release authorization. Tags are created by the release workflow, not pushed manually to trigger publication.

Use descriptive branch names, commit messages, and PR titles. Keep local Kanbalone tracking numbers, ticket URLs, and local-only references out of those fields, PR descriptions, and public documentation. Use verified GitHub PR or issue links for public tracking and keep local references in the local tracker or handoff. Summarize the verification in the PR so it can be read independently.

# Working efficiency and priorities

- Prioritize desktop PC workflows. Narrow/mobile layouts are low priority unless the user explicitly requests them or this change introduces a regression that blocks the primary workflow. Record unrelated existing layout issues as low-priority follow-ups instead of expanding the current task.
- Use one primary agent by default. After the implementation is stable, use one independent reviewer to satisfy review requirements. Avoid separate implementation, QA, and review agents running overlapping investigations; add another agent only when a concrete, independent need justifies the cost.
- Read only the latest handoff section first. Consult older logs and previously reviewed files only for a specific unresolved question. Prefer concise findings, file paths, and diffs over repeatedly forwarding full context.
- Consolidate implementation before independent review and verification. Run the relevant checks once; after a change or failure, rerun the affected checks. Do not repeat broad checks, source reads, or screenshots when nothing relevant changed.
- Preserve verification of data integrity, saving, concurrency, and the main user workflow. Keep required UI evidence, but capture only the comparable states needed to establish the result. Do not grow a verification matrix for speculative edge cases unrelated to the change.
- Keep progress reports short and focused on new findings, blockers, or completed milestones. Avoid repeating plans, known results, or unchanged status checks.
- Immediately before push or PR/MR creation, inspect staged, unstaged, and untracked files. Treat unexpected uncommitted files as a possible anomaly: determine their origin, scope, and whether work was omitted. Commit intended changes or record why unrelated work is safely isolated; never hide the anomaly with an indiscriminate commit, stash, or deletion.
