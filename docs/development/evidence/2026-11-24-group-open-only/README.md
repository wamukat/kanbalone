# Open only in Group view

Captured on 2026-11-24 JST in Chromium 159.0.8154.6. Both builds used a 1440 × 900 desktop viewport at device scale 1. English used the light theme and Japanese used the dark theme. The 18 original PNGs were copied with their SHA-256 hashes verified. Both capture runs reported zero horizontal overflow and zero browser or HTTP errors.

| Build | Source and served assets |
| --- | --- |
| Before | `bc660790debc57cc5f35d65e0a19985447eb9788`, `app-KM7W5V4U.js`, `styles-ETW7E6TZ.css` |
| After | The same base plus the Group filter changes. SHA-256 of the public source manifest `f0e07b096c872434eb352ae065a8c070a008ea4bc5dd02e6af8974241390323b`. Served `app-MVUMGW7X.js` and `styles-PTVZYODS.css`. |

## Reproduce the comparison

Use separate copies of the same synthetic fixture. Launch desk has 15 tickets. Its mixed Launch readiness Group includes open and completed tickets, archived tickets, and families with a completed parent or archived parent and an open child. It also has a completed-only Group, an archived-only Group, an empty Group and two unassigned tickets, one completed. Quality desk has one open and one completed ticket. The fixture uses Working and Accepted lane equivalents with only Accepted configured for completion. It contains exclusively synthetic data.

1. Open **Launch readiness** in Group view with archives folded. Before, completed tickets appear and the toolbar has no completion filter. After, **Open only** starts off and the same rows appear in the same order.
2. Focus **Open only** and press Enter. Four actionable open tickets remain, plus three reference parents for visible open children. Each reference has a visible reason and offers neither ticket details nor membership removal. The Group heading remains at four open and eleven total.
3. Expand **Show archived tickets** with **Open only** on. Two archived open tickets become actionable and archived completed tickets stay excluded except when needed as reference parents. Before, the same archive action also shows completed archived tickets.
4. Select **All** on the left and open **Shipped checklist**. Its completed ticket appears before and is replaced by an explanation after. Switch to **No Group**. After, the open ticket remains and the completed ticket is filtered out while the heading still shows two total.
5. Reload Launch desk and confirm the setting persists. Open Quality desk and confirm it still starts off. The capture runs compared both board exports and the Group totals before and after these view changes and found them equal.

| State | English light before | English light after | Japanese dark before | Japanese dark after |
| --- | --- | --- | --- | --- |
| Mixed Group, default | [Before](before-en-light-mixed-default.png) | [After](after-en-light-mixed-default.png) | [Before](before-ja-dark-mixed-default.png) | [After](after-ja-dark-mixed-default.png) |
| Mixed Group, Open only enabled | See default baseline | [After](after-en-light-mixed-open-only.png) | See default baseline | [After](after-ja-dark-mixed-open-only.png) |
| Mixed Group, archives shown | [Before](before-en-light-mixed-archives.png) | [After](after-en-light-mixed-archives.png) | [Before](before-ja-dark-mixed-archives.png) | [After](after-ja-dark-mixed-archives.png) |
| Completed-only Group | [Before](before-en-light-completed-group.png) | [After](after-en-light-completed-group.png) | [Before](before-ja-dark-completed-group.png) | [After](after-ja-dark-completed-group.png) |
| No Group | [Before](before-en-light-no-group.png) | [After](after-en-light-no-group.png) | [Before](before-ja-dark-no-group.png) | [After](after-ja-dark-no-group.png) |

The old build has no **Open only** state. The default baseline uses the same Group and archive setting as the new enabled capture.

## Behavior checks

All 52 tests in the targeted Chromium run and all seven hierarchy unit tests passed.

- Tests cover all four completion/archive toggle combinations in Group and No Group, matching row order in the regular and virtual lists, and distinct empty states for absent, completed and archived work.
- Browser checks covered per-board persistence, isolation from List, and a cancelled removal preview that still included a hidden completed child. API reads confirmed that filtering and the cancelled preview preserved stored board data.
- Completion and reopening were checked through the ticket API and reload. The editor retained an unsubmitted draft and caret through an external completion event and a cancelled discard. On closing, focus moved to the next visible ticket or returned to the filter when the list was empty.
- A separate 1,003-ticket browser fixture crossed API page boundaries. Search found a late open child and skipped the reference parent and completed tickets. Completing that last open child removed its family from the result, switched from the virtual to the regular list and restored focus to the next actionable ticket. The API confirmed the saved completion and parent relation.

The comparisons cover desktop layouts. Smartphone-specific adjustments and human usability testing were outside the scope.
