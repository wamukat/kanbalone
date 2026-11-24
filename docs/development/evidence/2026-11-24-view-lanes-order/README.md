# Lane filters and ticket order in saved custom views

Captured in Chromium 158 on a 1440 × 900 desktop viewport at device scale 1. Both builds used English with the light theme and Japanese with the dark theme. The 16 original PNGs were copied byte for byte and verified against the capture manifests. Both captures completed without unhandled browser errors.

| Build | Source |
| --- | --- |
| Before | v1.4.0, commit `15bfc3b58e223ef6ff2a751e643f39c41bb04086`. The footer shows 1.4.0. |
| After | The same base plus the lane and order changes. SHA-256 of the candidate source manifest `7622b62307090ab658b95a202d1007cc75ebc821ad7ee809c4e1da590f4a8a4a`. |

Use separate copies of the same synthetic fixture with two boards, eight tickets and three comments. The saved **Release desk** view uses the Design Studio and Publishing boards, their existing tag rules, and open tickets only. Before and after, this view starts with the same five tickets in the same order.

## Filter by lane on each board

1. Open **Release desk**, choose **Edit view**, and wait for the count preview. The before screenshot shows the editor at this position. In the candidate editor, each board starts with **All lanes**.
2. Choose **Select lanes** for each board. Select **In progress** and **Review** in Design Studio, and **Scheduled** in Publishing. Keep the existing tag and completion rules. The preview settles at three matches, with two from Design Studio and one from Publishing.
3. Save and reload. The three matches remain and the stored configuration contains the selected lanes under their respective boards. The comparison baseline for this state is the original five-ticket list because v1.4.0 has no lane selection.

| State | English light before | English light after | Japanese dark before | Japanese dark after |
| --- | --- | --- | --- | --- |
| Editor before changes | [Before](before-en-light-settings-top.png) | [After](after-en-light-settings-top.png) | [Before](before-ja-dark-settings-top.png) | [After](after-ja-dark-settings-top.png) |
| Lane selection with settled counts | See editor baseline | [After](after-en-light-lane-selection-settings.png) | See editor baseline | [After](after-ja-dark-lane-selection-settings.png) |
| Saved lane selection after reload | [Original list](before-en-light-default-list.png) | [After](after-en-light-lane-selection-reloaded.png) | [Original list](before-ja-dark-default-list.png) | [After](after-ja-dark-lane-selection-reloaded.png) |

A ticket can match any selected lane on its own board and must also match the tag and completion rules. An empty selection gives zero matches for that board. A renamed lane retains its selection, and a deleted lane shows a warning. **All lanes** includes future lanes. A selection of existing lane IDs stays fixed when a new lane is added.

## Change ticket order within each board

1. Restore the original rules and open **Release desk**. **Lane and ticket order** shows the same five rows as v1.4.0.
2. Change the list selector to **Highest priority first** without saving. The higher-priority rows move earlier within their own boards. The stored view keeps its original order, and reverting restores the visible order.
3. Change the selector to **Newest body or comment update first**. Rows with newer content activity move earlier within their board. Save the order and reload. The API and reloaded page retain that order. Both alternate sorts keep the board groups in the same order, and ties follow the original lane and ticket order.

| State | English light before | English light after | Japanese dark before | Japanese dark after |
| --- | --- | --- | --- | --- |
| Default order | [Before](before-en-light-default-list.png) | [After](after-en-light-default-list.png) | [Before](before-ja-dark-default-list.png) | [After](after-ja-dark-default-list.png) |
| Temporary priority order | See default baseline | [After](after-en-light-priority-temporary.png) | See default baseline | [After](after-ja-dark-priority-temporary.png) |
| Temporary content activity order | See default baseline | [After](after-en-light-content-activity-temporary.png) | See default baseline | [After](after-ja-dark-content-activity-temporary.png) |

## Behavior checks

All 281 unit and API tests and all 10 targeted Chromium end-to-end tests passed.

- Browser checks covered matching across boards, the settled preview, save and reload, and temporary order and revert. Pagination checks read the full result and compared its order, stable ties, and whole-result counts across pages. An open view reacted to content changes through its live event stream, including a ticket moving across a page boundary.
- A preview candidate opened a v1.4.0 fixture and retained both board export digests apart from the export timestamp. SQLite integrity and foreign-key checks passed. The migrated view used all lanes and the original order. An old cursor returned `409 stale_cursor` so paging could restart.
- The official database backup and restore preserved the saved lanes, sort, and recorded activity times across restart. An independently tested ticket kept its place after its latest comment was deleted. A real body edit, comment post, or comment content edit advances activity. No-op edits, ordinary ticket metadata changes, and comment deletion leave it at the recorded time.
- The migration initializes activity from ticket creation, comment posting and confirmed comment edits. Older body edits without recorded times cannot be recovered. Board JSON import creates new tickets and comments at import time. A full database backup preserves the recorded activity and saved view definitions.

## Query performance

The direct SQLite query check used 12,000 matching open tickets across six boards, three selected lanes per board and 50 tickets per page. Each measured call included exact counts and page excerpt projection. The median first and second page times were 21.45 and 21.38 ms for lane and ticket order, 23.26 and 23.18 ms for priority, and 19.56 and 19.27 ms for content activity. One priority sample took 83.21 ms. SQLite sorted the matching rows before the page limit and used the stored activity value for each ticket. The check used one synthetic, in-memory fixture and did not time JSON serialization, HTTP or rendering. [Samples and query-plan notes](performance.json)

Smartphone layouts and human usability testing were outside this comparison.
