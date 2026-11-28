# Pick up the work, together with AI

Kanbalone is a local workspace for individuals who develop with AI.
**No signup or login required. Manage your tasks entirely locally and get started on your own computer.**
With Docker ready, start Kanbalone with one command. Open it in your browser and create a board to begin managing tasks with almost no additional setup.
Connect external issue trackers or AI tools when you need them.
Turn an external request into actionable work, keeping research, implementation notes, and progress together.
People use the interface; AI tools use the API to continue the same work.

## Who it helps

For developers moving between issues, AI conversations, and personal notes, Kanbalone provides a place to keep the context needed to resume work.
Use your team's existing issue tracker while organizing your own investigation and implementation locally.
You can also start with personal tasks, without importing an external issue.

## Take in a request, develop it locally, share the result

Import a bug report, refer to the original, and build your investigation and implementation plan in the local body.
Have an AI tool record progress and verification results, then review the remaining work and acceptance items yourself.
Send back the comments you choose, without publishing every intermediate thought.

Imports support GitHub Issues, GitLab, and Redmine. Refreshing the external reference preserves the local body. Outbound updates are selected comments.

## Three benefits

**Spend less effort explaining the work again.** Keep goals, research, and progress on the ticket so people and AI can pick them up. The work record remains when a conversation ends.

**Develop your approach locally.** Separate the shared request from your implementation notes, and choose what to report back. Your team can keep its existing management process.

**See what needs your attention.** Review work by stage or purpose, including what remains and what awaits acceptance. AI tools can hand work to an Acceptance lane for you to review and move to a completion lane.

Groups keep related parent and child tickets together by purpose. Completed work remains as context while you identify what is still open.

## The experience we want

Capture an idea, find the relevant work, and take the next action without unnecessary steps.
Keep everyday screens quiet and avoid adding administrative work.
In the current development version, `N` opens ticket creation and `/` focuses search. In Kanban and List, arrow keys and Enter let you navigate, open a ticket and return. `M` opens the lane picker, and Ctrl+Enter / Cmd+Enter confirms. See the [user guide](user-guide.md#find-and-open-tickets-with-the-keyboard) for shortcut scope, cancellation and saving.

Discoverability and the effort required by real users remain subjects for evaluation.

“Lightweight” describes the rules and interaction effort we aim to reduce. It is not a claim of measured performance superiority.

## Where it fits

Kanbalone is designed for one developer and their AI tools. Use an appropriate issue management product when your priority is organization-wide permissions, enforced approvals, or time reporting.
Acceptance is a workflow convention, not a permission that reserves completion for a human.

Kanbalone does not run AI agents or automatically remember their conversations. It provides work records that people and AI tools can use.
Data is stored locally; external sending and how connected AI tools process data depend on the operations and tools you use.

[Get started](../../README.md#quick-start) · [User guide](user-guide.md)

Development discussion: [product comparison and evidence (Japanese)](../ja/developer/product-comparison.md) and [keyboard workflow proposal (Japanese)](../ja/developer/keyboard-workflow-plan.md).

See the [local hands-on comparison (Japanese)](../ja/developer/product-hands-on-comparison.md) for tested alternatives and differences.

## Documentation baseline

Implementation claims were checked against [main `92571d1`](https://github.com/wamukat/kanbalone/commit/92571d1e2fcef1a37d630fa02733e7f2c2ce0b83) on 2026-11-28. This includes development changes; see the [v1.6.0 release notes](../releases/v1.6.0.md) for the published release. Comparisons describe the dates and versions recorded in each study, not current rankings of other products.
