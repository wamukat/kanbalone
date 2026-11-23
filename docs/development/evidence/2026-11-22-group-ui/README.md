# Group view evidence

[PR #44](https://github.com/wamukat/kanbalone/pull/44)

Captured on 2026-11-22 JST. The baseline was Git commit
`5ff44622f74c2116147d60c11be7f86fbc2208d2`. The candidate runtime source
manifest SHA-256 was
`9e63449186213af639b135beaed786f6bc56d428c042c73df06905934b3743d7`.
[Source fingerprints](source-fingerprint.json) include hashes for both
runtimes, their Git base, Node v26.13.1 and the host platform. Both served
Kanbalone 1.0.0 through the actual Fastify backend and static assets.

The matrix crosses English and Japanese application locale, light and dark OS
color scheme, and a 1440 × 900 or 390 × 844 viewport. The sidebar is collapsed
at 390 px except while using its tag manager. Every run seeds a fresh SQLite
database with the same synthetic API inputs and deterministic IDs for that
fixture. The capture drivers use headless Chromium and wait for network idle,
fonts, animations, and two animation frames. Filenames record
`locale-theme-width-phase-state`. The viewport PNGs are original and unedited.
The JS records include the Chromium version, API-derived values and
computed styles. Each ticket has its own image directory.

## Group progress and completed marker

Open Release review → Group → All. Use Enter to select Release checklist.
The all-groups image shows zero-ticket Ideas, open Next milestone, mixed
Release checklist, fully completed Completed review, and Archived backlog
whose sole member remains unresolved. The previous Group choices displayed
open and total counts. The candidate also displays completed progress, using
all Group members including archives. The mixed Group has 2 completed of 5,
one of them archived. The unresolved archived ticket contributes to the
denominator only. Ideas has an empty indicator. The check appears only for
Completed review. Toggling archived ticket visibility does not change the
progress values or Group control coordinates. Across before and after, sort
controls retain their position and dimensions at both widths. On desktop the
ticket toolbar also retains its position and dimensions. In the one-column
390 px layout, its buttons move down 40 px with the five Group choices while
retaining their horizontal position and dimensions. The Group creation button
moves down the same amount beneath the choices.

Move Next milestone's sole ticket from Todo to Done in the editor and return
through its Group link. The check appears and progress reaches 1 of 1. A
direct ticket GET confirms resolution, and reload shows the same state.
Moving it back to Todo clears resolution and the check, confirmed again by
GET and reload. The English desktop sequences show the completed and reopened
states.

- Wide light, before and after.
  [Before](1520/en-light-1440-before-all-groups.png) · [After](1520/en-light-1440-after-all-groups.png)
- Narrow dark, before and after.
  [Before](1520/ja-dark-390-before-all-groups.png) · [After](1520/ja-dark-390-after-all-groups.png)
- Candidate completion and reopen.
  [Completed](1520/en-light-1440-after-completed.png) · [Reopened](1520/en-light-1440-after-reopened.png)

## Ticket tags in Group rows

In Release checklist, inspect Prepare release handoff and its child Verify
keyboard navigation. The baseline stores their tags and shows them in the
sidebar but omits them from Group rows. The candidate shows colored and
colorless badges in those rows beneath the ticket titles. Multiple badges wrap
at narrow widths. The long badge uses the shared truncation and exposes its
full label to assistive technology and in the tooltip. The lane column stays
aligned; badges stay within their rows and add no tab stops.

Open the parent ticket editor, add follow-up using the keyboard, save, and
return via the Group link. Rename design to visual review and change its color
to `#336699` using the sidebar manager. Check that the Group row updates
without reload and that direct ticket GET returns the new name and color.
Delete that tag using the sidebar confirmation. The tag disappears from the
row and GET, and stays absent after reload while the other tags remain.

- Wide light, before and after.
  [Before](1521/en-light-1440-before-parent-and-child.png) · [After](1521/en-light-1440-after-parent-and-child.png)
- Narrow dark, before and after.
  [Before](1521/ja-dark-390-before-parent-and-child.png) · [After](1521/ja-dark-390-after-parent-and-child.png)
- Candidate live rename and recolor, then removal.
  [Renamed and recolored](1521/en-light-1440-after-renamed-and-recolored.png) · [Removed and reloaded](1521/en-light-1440-after-removed-and-reloaded.png)

## Green links in Group descriptions

Read the short Release checklist description. Select Next milestone and
expand its long description. The plain summary has no link nodes. Expanding
the body exposes the handoff notes link; collapsing it removes the link again.
In Release checklist, edit the short description, change the link text, and
click Preview. The baseline uses Chromium's default blue. The candidate
retains underlining and uses the app's accent in the rendered body and editing
preview. Computed colors match normal and hover tokens in both themes; keyboard
focus visibly outlines the link. Link destinations are verified in the DOM.

Cancel the edit and compare the original Markdown returned by a direct Group
GET. Repeat the edit and save. GET shows the new Markdown and a revision
increment of one; reload reproduces the changed description.

- Short description, wide light.
  [Before](1522/en-light-1440-before-short-description.png) · [After](1522/en-light-1440-after-short-description.png)
- Expanded long description, narrow dark.
  [Before](1522/ja-dark-390-before-expanded-description.png) · [After](1522/ja-dark-390-after-expanded-description.png)
- Editor preview, narrow dark.
  [Before](1522/ja-dark-390-before-editor-preview.png) · [After](1522/ja-dark-390-after-editor-preview.png)
- Candidate saved description.
  [Saved and reloaded](1522/en-light-1440-after-saved-and-reloaded.png)

## Include unassigned tickets in Group view

Open the separate Grouping review fixture. Planned work contains Scheduled
review; three additional tickets, including an archived ticket, have no Group.
The baseline exposes only Planned work in Active and All. The comparable
candidate list keeps Planned work selected and adds No Group
(グループ指定なし) below it. Select No Group with Enter. The detail shows the
unassigned parent, its child, and the parent's design tag. It omits the
assigned ticket, and the archived ticket appears on disclosure. The count
includes the archived ticket. This virtual choice has no progress, completion
marker, or Group editing and membership controls. On a second fixture with no
real Groups and only one archived unassigned ticket, No Group is selected by
default and the archived ticket can be disclosed.

From No Group press N and create New unassigned ticket. Its ticket GET returns
`groupId: null`; reload retains it in the virtual list. Use the real Group's
Add existing tickets control to assign the parent with its child and the
archived ticket. Return to No Group and focus the one remaining ticket. A
separate live API membership write moves that ticket to Planned work. The
virtual choice disappears and keyboard focus returns to Planned work. GET and
reload confirm the assignment and the absence of No Group. Group collection
GET contains the real Group ID only throughout.

- Same Group selected, wide light.
  [Before](1523/en-light-1440-before-group-list.png) · [After](1523/en-light-1440-after-group-list.png)
- Same Group selected, narrow dark.
  [Before](1523/ja-dark-390-before-group-list.png) · [After](1523/ja-dark-390-after-group-list.png)
- Candidate additional states.
  [No Group selected](1523/ja-dark-390-after-unassigned.png) · [Archive disclosed](1523/en-light-1440-after-unassigned-with-archive.png) · [Unassigned ticket created](1523/en-light-1440-after-created-unassigned.png) · [Last ticket assigned](1523/en-light-1440-after-last-ticket-assigned.png)

### Delayed candidate failure after switching to No Group

An independent review on 2026-11-22 JST used fresh SQLite fixtures, Chromium
159.0.8154.6 and Node 26.13.1 in Japanese light mode at 1200 × 800. The before
runtime was `d24c17dfa7a647cc1fe76416ae088d36b907a225`. The after runtime used
that tree with the candidate-loading guard whose `public/app-group-board.js`
SHA-256 was `6185efd24c3feeafb9e7ace70acbab476f78fa81b4073beab39aff0be5dad705`.

On the fixture board, click Add existing tickets in the real Group. Hold its
candidate GET (`ungrouped=true`, `order=position_asc`, `limit=200`), then
select No Group and release the held request with an injected HTTP 503. The
before runtime displays the delayed failure in No Group. The after runtime
keeps the No Group row visible and suppresses the previous Group's error.
When the real Group stays selected, the same 503 displays the expected error
in both runtimes. The before and after images for that control are byte-identical.

Both runs showed zero browser mutation requests and JavaScript errors. Direct
Group and ticket GETs agreed before the action, after the response, and after
reload. The ticket kept `groupId: null` and appeared in No Group after reload.
The Playwright case `Group candidate failures appear only for the Group that
requested them` failed on the before runtime and passed with the guard.

- Selected No Group while the old request was held.
  [Before](1523/delayed-candidate-failure/before/selected-awaiting-old-response.png) · [After](1523/delayed-candidate-failure/after/selected-awaiting-old-response.png)
- No Group after the old request returned 503.
  [Before](1523/delayed-candidate-failure/before/old-failure.png) · [After](1523/delayed-candidate-failure/after/old-failure.png)
- Real Group still selected when the request returned 503.
  [Before](1523/delayed-candidate-failure/before/current-failure.png) · [After](1523/delayed-candidate-failure/after/current-failure.png)
- Stored data and browser results.
  [Before](1523/delayed-candidate-failure/before/result.json) · [After](1523/delayed-candidate-failure/after/result.json)

### Verification after updating against main

The update from `8a106f09f722243e4090cab26754f2a7a603bbd1` brought in image
attachments. Before the delayed-failure fix, the Group behaviors were replayed
with the original synthetic inputs through that main commit and combined
candidate `d24c17dfa7a647cc1fe76416ae088d36b907a225`. The English 1440 × 900
light and Japanese 390 × 844 dark captures passed the original GET and reload
assertions. Of 39 recaptures, 34 matched the corresponding originals byte for
byte and five differed by 8–16 pixels each. The differences were confined to
the edges of controls and preview text. Their cause was not established.

A separate isolated Chromium check opened the ticket editor in a real Group
and in No Group, pasted an image, and saved from both. GET confirmed the
stored Markdown and expected membership. Both images loaded after reload, and
the served bytes matched the uploaded PNG. After expanding a Group description
containing a previously uploaded image and an ordinary link, the image loaded
and the link kept its dark theme accent color.

## Reproduce and inspect

From the checkout root, with the repository dependencies and Playwright
Chromium installed:

```sh
evidence=docs/development/evidence/2026-11-22-group-ui
baseline=5ff44622f74c2116147d60c11be7f86fbc2208d2
mkdir -p coverage/group-ui/baseline-source
git archive "$baseline" src public package.json pnpm-lock.yaml tsconfig.json |
  tar -x -C coverage/group-ui/baseline-source
ln -s "$PWD/node_modules" coverage/group-ui/baseline-source/node_modules
node "$evidence/fingerprint.mjs" > coverage/group-ui/source-fingerprint.json
node --import tsx "$evidence/visual.mjs" before
node --import tsx "$evidence/visual.mjs" after
node --import tsx "$evidence/no-group.mjs" before
node --import tsx "$evidence/no-group.mjs" after
(cd "$evidence" && shasum -a 256 -c SHA256SUMS)
```

- Raw interaction and geometry records for progress, tags, and description links.
  [Before](before-results.json) · [After](after-results.json)
- Raw membership and focus records for No Group.
  [Before](1523-before-results.json) · [After](1523-after-results.json)

- Independent code and visual review.
  [Code review](review-code.md) · [Visual review](review-visual.md)
- Scoped test commands and results.
  [Focused checks](focused-checks.txt)
- Full local check and keyboard regression summary. Log paths in the summary
  refer to local-only files under `coverage/group-ui`.
  [Validation summary](validation.json)

The checks exercise the local Chromium runtime with synthetic data. Link
destinations are example URLs and were inspected without external navigation.
The measurements cover DOM geometry for the captured fixtures. Human
usability, assistive technology behavior beyond the inspected browser markup,
and other browser engines were outside this verification.
