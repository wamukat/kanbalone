# Custom view consistency with existing ticket screens

Recorded on 2026-11-24 JST. The custom list now presents `#ID` and the title in one link, using the existing List title and ID styles, and removes the duplicated metadata entry. The prior board bands, indented ticket panels and nested content alignment remain.

## Reference audit

| Field | Alignment with existing screens |
| --- | --- |
| ID and title | List and Group put `#ID` before the title in the same control; Kanban keeps them on the same heading row and detail shows the ID in its header. The custom list follows the List control and format. |
| Completion | The shared completion icon follows the title, as in Group/Kanban. Existing resolved-row styling remains visible. |
| Lane | The owning board's lane name is used, with the existing translated Lane label. |
| Tags and priority | Shared tag and priority badge renderers preserve names, colors, symbols and translated labels. |
| Comment time | The same locale-aware, seconds-inclusive timestamp formatting as ticket details. |
| Empty values | A visible dash for no tags, with an accessible No tags label; the existing No description and No comments yet text. A stored comment with empty text remains distinct from no comment. |

The custom view deliberately retains metadata labels because it has no shared column headers. It shows original body/latest-comment excerpts with expansion, while details render Markdown and show the comment history. These are the accepted reading functions, not display inconsistencies. Archived tickets remain excluded; no new relationship or workflow fields are added.

The same fixture ticket in the existing screens: [List](after-ja-dark-reference-list.png), [Group](after-ja-dark-reference-group.png), [detail](after-ja-dark-reference-detail.png). All six existing-screen screenshot pairs across the two languages were byte-identical before and after this change.

## Versions and comparison conditions

Before: `5eb3d4ab9870b13c567b55ff2016bc4d6ea8db69`. After: that source plus the three-file public UI patch, SHA-256 `356b2fdb27ed9afb5644ab0b79eaf17e7e7494e8210786a86da78b1e37a69a3e`. The production build serves `app-KM7W5V4U.js` and `styles-ETW7E6TZ.css`.

Both versions use Chromium 159.0.8154.6, 1440 × 900, device scale 1. English uses light theme; Japanese uses dark theme. Each pair uses the same isolated synthetic three-board/eight-ticket fixture, saved rules, scroll and focus. Default shows body and latest comment; compact temporarily hides both. A separate synthetic all-completion view checks the finished row. User data is excluded from the fixture.

| State | Before | After |
| --- | --- | --- |
| en-light, default | [Before](before-en-light-default.png) | [After](after-en-light-default.png) |
| en-light, compact | [Before](before-en-light-compact.png) | [After](after-en-light-compact.png) |
| ja-dark, default | [Before](before-ja-dark-default.png) | [After](after-ja-dark-default.png) |
| ja-dark, compact | [Before](before-ja-dark-compact.png) | [After](after-ja-dark-compact.png) |
| Completed ticket | [Before](before-en-light-completed.png) | [After](after-en-light-completed.png) |

## Verification

Open the custom view, identify a ticket by its title-line ID, and open it with the keyboard. Compare its fields and latest timestamp against its ordinary List, Group and detail screens; close details and verify focus returns to the row. Toggle and revert text panes, and inspect a completed ticket and empty fields.

All seven focused custom-view E2Es passed, including the title link's accessible name and ID. Browser JavaScript type checking and both localization catalog tests passed. The desktop comparisons had zero overflow and no browser/HTTP errors; ID was not repeated in metadata. Stored views and board data were unchanged by the read-only comparison sequence. Independent code and original-image review found no remaining inconsistency requiring a change.

Original screenshots are unaltered. This refinement is desktop-only; smartphone tuning and verification remain outside its scope. Synthetic Chromium checks do not establish human usability or behavior on every operating system/browser.
