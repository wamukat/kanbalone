# Board completion filter removal

Kanban and List show both open and completed tickets with the Completion control removed. The archive checkbox controls whether archived tickets appear. List can still use the Done lane to show completed work. Group and Custom views have their own completion controls.

The captures were made on 2026-11-27 JST in Chromium 158.0.8127.37 on macOS with agent-browser 0.26.0. Both builds display Kanbalone v1.5.0 in the footer. They ran production-bundled assets with separate SQLite databases seeded from the same synthetic data. See [manifest.json](manifest.json) for source fingerprints, served asset names, and the SHA-256 of each original capture.

## Before and after

All paired captures use a 1440 × 900 viewport at device scale 1, English, the expanded sidebar, and archived tickets excluded. Each light pair uses default board filters. Each dark pair starts with the same browser preference previously saved by selecting only **Open** in the baseline's Completion control.

| View and starting condition | Before | After |
| --- | --- | --- |
| Kanban, light, defaults | [Before](before-light-kanban.png) | [After](after-light-kanban.png) |
| List, light, defaults | [Before](before-light-list.png) | [After](after-light-list.png) |
| Kanban, dark, stored Open | [Before](before-dark-stored-open-kanban.png) | [After](after-dark-stored-open-kanban.png) |
| List, dark, stored Open | [Before](before-dark-stored-open-list.png) | [After](after-dark-stored-open-list.png) |

The light pairs show the six active tickets in the same lane or row order. The dark baseline shows four open tickets. The candidate also shows the two completed tickets. The archive checkbox follows the Tag filter in the candidate and the content starts about 40 pixels higher at the captured desktop width.

The candidate also shows the separate [Group Open only control](after-group-open-only.png), [Custom view Completion status field](after-custom-view-completion.png), and [Japanese List toolbar](after-ja-light-list.png).

## Reproduce

Create **Release desk** with the lanes **To do**, **In progress**, and **Done**. Use Done as the completion lane. Put all eight tickets in the **Launch readiness** Group. Leave the tags and relations empty.

| Lane | Active tickets | Archived ticket |
| --- | --- | --- |
| To do | Draft rollout checklist, Schedule support handoff | Retire old work item |
| In progress | Review starter guide, Verify release package | |
| Done | Publish setup notes, Approve release checklist | Store previous checklist |

1. Open Release desk in Kanban, then List. With default filters and archive unchecked, compare the toolbar and the six visible tickets.
2. In the baseline, expand **Completion** and turn off **Resolved**, leaving **Open** selected. Collapse the control, reload, and switch between Kanban and List. The Done lane or rows should now show zero of the two completed tickets.
3. Copy the baseline's `kanbalone:ui-preferences` value to the corresponding browser origin for the candidate fixture. Reopen each view. The candidate shows both completed tickets. The two archived tickets should stay hidden.
4. Toggle **Include archived tickets** on and off in either view. Reopen while it is on, then turn it off. In List, also choose **Done** from the lane selector and reload.
5. Open **Launch readiness** in Group and use Enter on **Open only**. Reload, expand **Show archived tickets**, and switch to List. In **Release review**, a Custom view scoped to Release desk with no tag filter, edit **Completion status** from Open to Resolved, save and reload, then save All.
6. For the windowed List, create **Backlog** with 426 tickets. Put items 001 and 425 in Done and archive items 002 and 426. In List, sort by ID and scroll to the end. Toggle archive visibility there.

## Observations

- Archive visibility was saved and restored in both Kanban and List. Checking the box showed the archived open and completed tickets. Unchecking it hid both while the active open and completed tickets stayed visible. Ticket collection requests used `archived=all` with archive access enabled and omitted a completion-state query. The checkbox rectangle was stable while toggling it at desktop width.
- The List lane selector isolated the two Done tickets after reload. The next preference save dropped the old completion filter and expansion keys.
- Group's **Open only** retained keyboard focus and persisted under its own browser preference after reload. Expanding archives included the archived open ticket. The normal List still showed the completed active tickets.
- The Custom view's **Open**, **Resolved**, and **All** settings were available through the form. The saved value and rendered tickets agreed after reload. Archived tickets stayed excluded. Board exports before and after these view changes were equal.
- The Backlog List used a virtual window across API pages. The final active Done item appeared near the end. The final archived item appeared when archive visibility was enabled and disappeared when disabled.
- At an emulated 390 × 844 viewport, the document fit the viewport. Scrolling the toolbar horizontally brought the archive checkbox into view in both modes. The Japanese desktop toolbar showed the translated lane and archive controls.

The evidence covers these synthetic tasks in Chromium. Hardware touch input and human usability testing are outside this verification.
