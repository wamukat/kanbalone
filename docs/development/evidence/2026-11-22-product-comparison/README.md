# Product comparison evidence — 2026-11-22

[Report (Japanese)](../../../ja/developer/product-hands-on-comparison.md)

Synthetic data only. These are comparison observations, not before/after evidence for a product fix. Viewport: 1280×844, light theme. Browser interaction: agent-browser. Human-side actions were simulated by the agent; no human participant study took place. No application code was changed.

## Recorded observation sequence

1. The study started the isolated official images listed in `environment.json`, with synthetic data and dedicated volumes. Recorded loopback ports identify this historical setup; they are not links to a service available to readers. A new study needs its own disposable environment.
2. Kanboard: initial login, create `Collaboration lab`, then a `Notification improvements` swimlane with purpose text. API settings provide the JSON-RPC token. Create task 1, embedded subtask 1, task 2 in the Done column.
3. Vikunja: register the synthetic evaluator. Create project 2 and tasks 1–3 via REST, relate task 2 as a subtask of 1. Set task 3 done. Initial List hides done tasks; Table includes them.
4. Redmine: change the initial password, load default English statuses/trackers via Administration, enable REST in Settings > Integration. Create project 1 and version 1, issues 1–3; issue 2 has parent 1. PUT issue 3 to Closed and read it back (creation did not retain the requested Closed status).
5. Kanbalone: create board 1 and Group 1; create parent 1 in Acceptance, child 2 in todo, ticket 3 in done. Child inherits Group 1.
6. API adds `AI handoff: retries implemented. Please verify delivery history.` to parent 1. Open/read GUI; Kanboard and Vikunja detail pages were already open and needed refresh to display this comment during the observation. Post `Human review: delivery history checked; retry remains open.` using GUI. GET comments/journals from API; all four contain both texts (`handoff-results.json`). No implementation work is implied by these fixture strings.
7. Membership: move Redmine child to version 2 and Vikunja child to project 3. GET both ends: parent membership unchanged, relationship retained. Kanbalone direct assignment of child 2 to Group 2 returns 409. Preview removing child 2 expands to parent 1 + child 2. Restore Redmine/Vikunja memberships. Kanbalone apply remove, GET both null memberships, then preview/apply add to Group 1 (`group-semantics.json`, `kanbalone-group-lifecycle.json`).
8. Parent completion: request Closed on Redmine parent with open child; GET still Resolved. Kanboard `closeTask` also sets subtask status 2. Vikunja parent done leaves child undone. Kanbalone move parent to done leaves child in todo. Record GUI and API results.
9. Kanbalone archive ticket 3, inspect hidden/expanded archive UI. Complete child 2: Group 1 absent from active list, present in all. Reopen child: Group 1 returns. Empty Group 2 remains active.
10. Read comparison data; restart only the four isolated containers; re-read. Parsed JSON equality passed for all captured objects (`restart-check.json`). Vikunja API session re-authenticated. This is normal restart persistence, not backup restoration or durability under crash.
11. Complete all tasks in other collections: Redmine close child then parent; version stays open. Vikunja finish child; project not archived. Kanboard close remaining task; swimlane stays active (`completed-collections.json`). Restore representative mixed demo states: Redmine parent Resolved/child New, Vikunja parent done/child undone, Kanboard parent open/subtask Todo, document task closed. Kanbalone parent done/child todo/document archived.
12. Keyboard spot checks: Kanboard board `n` opens create dialog; cancel. Vikunja `Cmd+K`, type `Retry`, inspect contextual task results; cancel.

## Image interpretation

- `kanboard-board.png`: initial board, document task in Done column but still open. This is intentional evidence that column and closed state differ.
- `kanboard-handoff.png`, `vikunja-handoff.png`: initial GUI comment input before actual submission. Buttons were below the viewport; first automation clicks did not submit. These are **not** proof of persistence or product failure.
- `*-review-persisted.png`: GUI comments after submission/readback. Kanboard screenshot is after parent close, so the subtask is already Done while the earlier comment says it remains open.
- `kanbalone-handoff.png`, `redmine-handoff.png`: detail state near handoff; API JSON is the persistence evidence.
- `kanbalone-completed-parent.png`, `kanbalone-archived.png`: parent context, open child and separate archived visibility.
- `redmine-roadmap-final.png`: version purpose, completed/open counts, closed issue styling. Parent remains Resolved with open child.
- `kanboard-closed-parent-board.png`: standard open filter after parent close.
- `vikunja-open-tasks.png`, `vikunja-completed-parent.png`: default List excludes completed tasks.
- `vikunja-all-tasks.png`: despite the filename, this is the **unsuccessful additional-filter attempt** against a List with its own `done = false` filter. Do not present as an all-task view.
- `vikunja-table-all.png`: successful all-task view using Table. Child displayed as project-local #4 after its project round trip; internal ID remains 2.
- `*-keyboard-*.png`: shortcut entry points, not proof of an entire keyboard-only workflow.

## Limitations and handling

All data is disposable and synthetic; no external emails, issues or comments sent. The original helper, account credentials and authentication files are not included. Token values are absent from the published JSON. Application API/administrator access is not a least-privilege evaluation. SQLite, three tasks, one actor, no failure injection, load testing, upgrade, restore, MCP, or long-term stability validation. Jira excluded by agreement because no usable Data Center license was available.

Screenshots differ in workflow semantics because products differ. They support observations, not a pixel-based ranking. The recorded containers and volumes are not distributed with these files; their continued availability is not assumed. These selected observations are not a self-contained replay harness.

## Archive integrity and current implementation

The PNG and JSON files are retained unchanged from the uncommitted study artifacts reviewed on 2026-11-28. [SHA256SUMS](SHA256SUMS) records their integrity at publication; it does not independently establish when they were captured. Container tags and local image IDs are recorded in [environment.json](environment.json). Exact browser/automation versions were not recorded in this study. During the document review, the repository tag `v1.0.0` was checked and resolves to `0bf19d1b21536457e503068c7b6d2340e93b30e3`; this tag lookup supplements, rather than replaces, the captured container image identity.

Kanbalone was v1.0.0 in this study. For current development behavior, see the [updated comparison](../../../ja/developer/product-comparison.md), [keyboard status](../../../ja/developer/keyboard-workflow-plan.md), and [user guide](../../../en/user-guide.md). No comparison benchmark was rerun as part of the documentation update.
