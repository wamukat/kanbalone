# Archive visibility toggle in Kanban and List

The **Include archived tickets** control in the Kanban and List toolbars uses a toggle button styled like Group's **Open only** button. The same archive setting applies when switching board views. Group manages its open-only and archive disclosure states independently.

Captured on 2026-11-27 JST in Chromium 158.0.8127.37 on macOS with agent-browser 0.26.0. Both builds used Japanese, a 1440 × 900 viewport at device scale 1, and the expanded sidebar. The baseline is `dd6116ad198c24fa7b83dc1e8e6583d86cb84763`. Both builds display v1.5.0 in the footer. The candidate used an SQLite backup of the baseline's synthetic fixture. [manifest.json](manifest.json) records the source fingerprints, served assets, observed control positions, and original image hashes.

| View | Archive state | Before | After |
| --- | --- | --- | --- |
| Kanban, light | Off | [Before](before-light-kanban-off.png) | [After](after-light-kanban-off.png) |
| Kanban, light | On | [Before](before-light-kanban-on.png) | [After](after-light-kanban-on.png) |
| List, dark | Off | [Before](before-dark-list-off.png) | [After](after-dark-list-off.png) |
| List, dark | On | [Before](before-dark-list-on.png) | [After](after-dark-list-on.png) |

[Group with Open only selected](after-light-group-open-only.png) shows the reference button and the separately expanded archive disclosure. The earlier [Completion filter removal evidence](../2026-11-27-board-completion-filter/README.md) records the preceding change.

## Reproduce

Use the **Release desk** fixture from the preceding evidence. It has six active tickets across **To do**, **In progress**, and **Done**. The archived tickets are **Retire old work item** and **Store previous checklist**. Treat Done as the completion lane. Put all tickets in **Launch readiness**.

1. Open Kanban with archive visibility off. Confirm both active open and completed tickets are visible and the two archived tickets are hidden.
2. In the candidate, focus **All tags**, press Tab to reach **Include archived tickets**, and activate it with Space in Kanban or Enter in List. The archived open and completed tickets should appear, the button should remain focused, and its accessibility state should become pressed.
3. Reload with the setting enabled, then switch from Kanban to List. Both archived tickets should stay visible. Turn archive visibility off and reload. Both archived tickets should be hidden again.
4. With board archive visibility enabled, switch to Group. Expand Group's archive disclosure separately and enable **Open only**. After a reload, expand the disclosure again. It should show the archived open ticket while keeping the archived completed ticket hidden. Return to List and confirm both archived tickets are still visible there.

## Observations

- The pressed and unpressed states used the same control rectangle in each view. The **Include archived tickets** label stayed constant and `aria-pressed` followed the visible state. The saved browser preference `filters.includeArchived` matched both states after reload.
- Space in Kanban and Enter in List toggled the button with focus retained. Switching views retained the enabled setting. Both archived tickets appeared with the control on and were hidden again when it was off.
- In the light theme, both buttons shared the same text and background colors, border color and width, corner radius, and font size in each state.
- Group's **Open only** selection applied after reload and composed with its archive disclosure. Changing it left the board's archive setting in effect. The candidate's stored ticket titles, completion states, and archive states matched the baseline fixture's rows.
- At 390 × 844, horizontal scrolling inside the List toolbar brought the archive button fully into view. The document fit the emulated width.

Scope covered desktop Chromium and an emulated narrow viewport. Hardware touch input and human usability were outside this check.
