# Ticket detail empty states

Captured 2026-11-29, Chromium, Japanese/light, 1440 × 900, identical isolated two-ticket fixtures. Baseline: `48b72e8fd967811844d42eb1e8dd36b09f085e36`. Candidate sources and original captures: [SHA256 manifest](sha256.json). No existing user data was used.

| Task/state | Before | After |
| --- | --- | --- |
| Open a ticket for the first time | [Before](originals/before-first-visit.png) | [After](originals/after-first-visit.png) |
| Edit with no relationships, menu closed | [Before](originals/before-relations-closed.png) | [After](originals/after-relations-closed.png) |
| Expand relationship types with Enter | [Before](originals/before-relations-open.png) | [After](originals/after-relations-open.png) |

First visits now show the body directly and hide the changes tab. A validated previous observation still selects changes on revisiting. Saving the current observation does not turn it into the baseline of the open session. Unmatched/expired observations use the body. Keyboard tab navigation skips the hidden changes tab. Update/storage notices remain available in the current view without a baseline.

The closed relationship menu previously occupied 127.91px because its invisible buttons wrapped inside zero width. Opening it reduced the row to 27.78px. Removing closed options from layout makes the row 25.19px closed and 27.78px open. Measurements are in the original JSON files. Existing icons, relation types and selection flow are retained.

Sequence: first visit → wait for saved observation → capture → edit → capture empty relations → Enter to expand → wait for transitions → capture → Enter to collapse → reopen → choose Related → search and Enter → save → API readback of related IDs → reopen and check the comparison tab → switch to another first-visit ticket → invalidate the stored series → return and verify the body and keyboard navigation. Existing regression cases cover parent/blocker/child/related selections and removals, failed comparison reads/writes, delayed navigation, and two-tab observation ordering.

Validation: six focused Chromium cases and one baseline capture case passed; public types, CSS token lint and production build passed. Screenshots demonstrate initial state and geometry; API/IndexedDB assertions establish saved results. No mobile matrix, dark-mode matrix, or human usability study was conducted; changes reuse existing colors and desktop-first layouts.
