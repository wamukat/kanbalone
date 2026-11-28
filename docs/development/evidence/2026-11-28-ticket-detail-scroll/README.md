# Ticket detail scrolling and title hierarchy

## Comparison setup

The captures use the synthetic **Operations desk** board, its List view, and ticket **#7**. The List starts 164 CSS pixels down. The ticket contains a long Japanese title, Markdown H1 and H2, a local PNG, three Tasks and two comments. The candidate started from a backup of the baseline database and attachment. The ticket, Tasks and activity API responses matched before the comparison.

Captured on 2026-11-28 JST in Chrome 158.0.8127.89 on macOS 26.7.3 with agent-browser 0.26.0, device pixel ratio 1 and reduced motion. Both runtimes used Node.js 26.13.1 and reported Kanbalone 1.6.0. The baseline was commit `d8fe04952e139f83cd3cfeeedbcb624f89cde02c`. See the [image and source manifest](manifest.json) for provenance.

## GitHub issue #96 · Scroll and dismiss

| State | Viewport and appearance | Before | After |
| --- | --- | --- | --- |
| Open from List at the start of the body | 1024 × 768, Japanese, light | [Before opening state](before-ja-light-detail-top.png) | [After opening state](after-ja-light-detail-top.png) |
| Wheel down 600 pixels over the body | 1024 × 768, Japanese, light | [Before wheel result](before-ja-light-detail-wheel.png) | [After wheel result](after-ja-light-detail-wheel.png) |

Open ticket #7 from the scrolled List and wheel down 600 CSS pixels over the body. The expected result is to reveal more body content while the ticket title and edit pencil stay visible and the List stays in place.

Before, the document scrolled 600 pixels and carried the header above the viewport. After, the modal's internal scroller moved 600 pixels. The header and pencil kept the same position, the document stayed at 0, and the List stayed at 164. At the bottom, the [Tasks and comments still appear within the modal](after-ja-light-detail-bottom.png). Additional wheel input over the body at both ends and over the backdrop left the background positions unchanged.

Drag from inside the dialog to its backdrop and release. The detail stays open. Click the backdrop to close an unedited detail. Focus returns to the ticket opener and the List still sits at 164. Enter on that opener brings the ticket back. On open the existing edit pencil receives focus, and Tab stays within the dialog.

## GitHub issue #104 · Title hierarchy

| Viewport and appearance | Before | After |
| --- | --- | --- |
| 1024 × 768, Japanese, light | [Before desktop light](before-ja-light-detail-top.png) | [After desktop light](after-ja-light-detail-top.png) |
| 1024 × 768, English, dark | [Before desktop dark](before-en-dark-detail-top.png) | [After desktop dark](after-en-dark-detail-top.png) |
| 390 × 844, Japanese, light | [Before narrow light](before-ja-narrow-detail-top.png) | [After narrow light](after-ja-narrow-detail-top.png) |

Open the same ticket from the List. The expected result is a clear title above the body headings with the edit pencil visible to its right. The computed title grew from 15 to 21 CSS pixels and its font weight changed from 600 to 650. Body H1/H2 changed from 28/21 to 18/15 pixels. At 390 pixels, the long title wraps in the dialog and leaves 12 pixels of horizontal clearance before the edit pencil. The new detail header uses the existing edit pencil. The separate inline body edit control still opens the body editor.

## Draft protection and stored result

The full editor opens from the header pencil and focuses the title input. Change the title and body, select the last body character and click the backdrop. The [discard confirmation](after-ja-light-dirty-confirm.png) opens above the editor. Escape dismisses the confirmation, keeping the draft, selection and field focus. Request dismissal again and confirm discard. The detail closes and returns focus to the original ticket opener.

The same guard keeps Task and inline body drafts available for continued editing after Escape cancels the nested confirmation. An independent Playwright run verified new comment draft text and selection after canceled backdrop and Escape dismissal, both on a freshly opened ticket and after discarding a Task draft.

For the storage check, use the inline body pencil, append the QA sentence, cancel the dismissal prompt with Escape and save. Reload the ticket. The [saved sentence appears after reload](after-ja-light-saved-body-reload.png), and the embedded PNG still loads. The ticket GET returned exactly the saved Markdown with the original ticket title and both comments. The Tasks GET still matched all three seeded Tasks.

## Header position during focus and centering

The [intermediate saved frame](diagnostic-a52814c-scroll-into-view.png) exposed a second scroll container. Centering the saved paragraph moved the outer form 54 pixels and pushed the header from y=49 to y=−5. Reaching the Task #1 edit control with Tab also scrolled the outer form and clipped the header. A wheel over the detail body stayed inside the inner scroller.

The final fix clips overflow at the outer form and keeps the inner scroller active. Repeating the centering step and tabbing to Task #1 edit each left the outer form at 0 and the header at y=49. The saved paragraph and the header and its edit pencil are visible in the [final saved frame](after-ja-light-saved-body-reload.png). The final runtime returned the same saved ticket and Task records.

## Scope and source revisions

The top and wheel comparisons use the earlier candidate identified in the manifest, with fixed viewport sizes. The next snapshot removed two overscroll rules and was used to recheck the scroll limits and draft confirmation. Commit `a52814cc2328bfb6f0471f604607f92a97feac47` followed with the default-width adjustment and was used for the inline save. The final saved frame and focus check use `c9f2ba9992dd5bb3fa79457d58a5fb9ccf175c2b`, which adds the outer-form overflow fix.

The documented interaction checks use a synthetic local board in desktop Chrome. The image check covers the existing embedded PNG. The nested discard confirmation is the top-layer interaction exercised in the capture sequence. The Playwright suite covers additional keyboard, drag and remote import cases.
