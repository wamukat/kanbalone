# Board lane and tag multiselect

List uses a checkbox picker for lanes. Kanban and List use a checkbox picker for tags. A ticket can match any selection within either picker and must match both active filters. Clearing a picker returns that field to all values.

Captured on 2026-11-27 JST in Chromium 158.0.8127.37 on macOS with agent-browser 0.26.0. Each comparison uses the same synthetic SQLite fixture, 1440 × 900 viewport at device scale 1, sidebar state, locale, and theme. The baseline is `3d8f7afbd71d1842d1d4869456c7316eaab4f091`. The app footer on both builds displays v1.5.0. The [manifest](manifest.json) records source fingerprints, served assets, and original image hashes.

## Original captures

| View and state | Before | After |
| --- | --- | --- |
| List, English light, defaults | [Before](before-en-light-list-default.png) | [After](after-en-light-list-default.png) |
| List, English light, To do lane and Docs tag | [Before](before-en-light-list-single.png) | [After](after-en-light-list-single.png) |
| Kanban, Japanese dark, defaults | [Before](before-ja-dark-kanban-default.png) | [After](after-ja-dark-kanban-default.png) |
| Kanban, Japanese dark, Release tag | [Before](before-ja-dark-kanban-single.png) | [After](after-ja-dark-kanban-single.png) |

The old select controls supported one value. The new behavior is shown separately with [two lanes checked](after-en-light-list-lane-popup.png), [three tags checked](after-en-light-list-tag-popup.png), and [the closed summaries](after-en-light-list-multi-summary.png).

## Reproduce

Use **Release planning** with the four lanes below, with Done as the completion lane. Add the listed tags and put the tickets in **Launch readiness**. Add a saved **Review queue** Custom view for open tickets tagged Release in this board.

| Ticket | Lane | Tags | Priority | Archived |
| --- | --- | --- | --- | --- |
| Publish rollout notes | To do | Docs, Release | High | |
| Check design tokens | To do | Design | Medium | |
| Verify upgrade checklist | In progress | QA, Release | Urgent | |
| Draft support handoff | In progress | Docs | Medium | |
| Review release page | Review | Design, Release | High | |
| Approve docs update | Review | Docs | Medium | |
| Release changes | Done | Release | Low | |
| Archive previous checklist | Done | Docs, QA | Medium | Yes |
| Plan training handoff | To do | | Medium | |
| Retire old status note | In progress | Docs | Low | Yes |

1. Open List with default filters, then choose **To do** and **Docs**. Only **Publish rollout notes** should appear in either build. Reload to confirm the selection. In Kanban, apply **Release** alone and confirm matches across the four lanes.
2. Save **To do** and **Docs** in the baseline. Copy its saved browser preference value `kanbalone:ui-preferences` to the candidate fixture origin, then reload List. The candidate should show the same ticket and both selected options.
3. Press Enter on **Lane** to focus its first checkbox. Focus **In progress**, then press Space. The popup should stay open with both checkboxes selected. Escape should close it and return focus to **Lane**.
4. Open **Tag** and select **Release** and **QA** while **Docs** is selected. The popup should stay open. The three matching tickets should be **Publish rollout notes**, **Verify upgrade checklist**, and **Draft support handoff**. The visible summary should include two names and the remaining count. The accessible name and tooltip should provide all three names. Clicking the search field should close the popup and leave focus on the field.
5. Combine filters with search, priority and **Include archived tickets**. Reload, switch between views, and clear each picker. Use **Reset filters** to return to defaults. Group should retain its own **Open only** setting. **Review queue** should continue to apply its saved Release and open-ticket conditions.
6. For the paged List, create 450 numbered tickets in **Backlog**. Alternate To do with Docs and In progress with Release. Move item 002 to Review, tag item 003 Design, and archive items 004 and 450. Filter to To do and In progress with Docs and Release selected. Sort by ID, scroll to the end, and toggle archive visibility.

## Observations

- The paired views showed the same tickets for the default and matching single selections. The candidate converted the old lane and tag preferences to selected IDs and restored the saved multiselect after reload.
- On List, the selected lane and tag sets matched three tickets with archives excluded and four with archives included. Search and priority narrowed the results further. Kanban reused the tag selection and archive setting, and returning to List restored the lane selection.
- Enter focused the first checkbox. Space changed the selection without closing the popup or moving focus. Escape returned focus to the trigger, and clicking Search closed the popup with focus in Search. With three tags selected, the trigger displayed two names and a remaining count. The accessible name and tooltip included all three names. Longer visible summaries can truncate.
- Each picker could be cleared while open. Reset restored the default board view. Group and the saved Custom view showed their independent conditions, and all 460 fixture ticket rows compared equal for titles, lanes, priority, completion and archive state.
- The windowed List displayed 446 matching active rows and 448 with archives included. Each result set used three collection pages, and continuation requests carried the same lane and tag filters. Scrolling reached the last active match and revealed the last archived match when archives were included.

- In the final build, To do and In progress both fit in the desktop Lane summary. The Tag summary displayed Docs and QA with `+1` in English or `ほか1件` in Japanese. At 390 × 844, the Tag popup fit once the toolbar was horizontally scrolled to its trigger, and selecting a tag still filtered the List.
- The full interaction and pagination checks used the build immediately before the summary width and count adjustments. The final build repeated the paired comparison, popup selection, focus and dismissal, summary measurements, and narrow-width check. The manifest records both source fingerprints.

Verification used Chromium with synthetic fixtures and an emulated narrow viewport. Human usability and hardware touch input were outside this check.
