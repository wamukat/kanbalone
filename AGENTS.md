# UI/UX changes

For each UI/UX ticket, capture and attach before-and-after screenshot evidence before moving it to Acceptance or marking it complete. Follow [the UI/UX review rules](docs/development/ui-ux-review.md#per-ticket-image-evidence-required).

Use comparable task data, viewport, theme, and UI state. Record versions, reproduction steps, expected/observed results, and limitations. For interaction bugs, include the relevant sequence and verify stored results; a single screenshot is not proof of persistence or timing. If a before state cannot be reproduced, state the reason instead of fabricating it. Keep existing user data separate from evaluation fixtures.

# Development and release workflow

Follow the team rules in [the release guide](docs/en/developer/release.md#team-operating-rules) ([日本語](docs/ja/developer/release.md)). Use short-lived branches and reviewed PRs for all changes. Require user acceptance in chat and passing Required checks before merging; the agent may perform the merge on the user’s behalf. GitHub approval counts are not required. Reconfirm acceptance if the accepted content changes; do not use administrator bypass for routine work. Complete bilingual release notes before merging the release preparation PR, record local candidate verification after dry-run, and publish only within the user's release authorization. Tags are created by the release workflow, not pushed manually to trigger publication.
