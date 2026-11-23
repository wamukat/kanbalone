# Cross-board custom view verification

Recorded on 2026-11-23 using synthetic data only. These original screenshots compare the existing reading workflow with the new saved cross-board list.

## Versions and conditions

- Before: published v1.3.0 source, commit `a6465a34b2c13d799f538b51af0bea37aff4ffc4`, built locally with the production asset bundler.
- After: this implementation, built with the same production asset bundler. The captured source manifest SHA-256 is `74bbcffdb61434518beda5f3e59f282d50d400ee43b0707fc4021d2c0f47ef60`. The package version remains 1.3.0 because this feature is unreleased.
- English: 1440 × 900, light theme. Japanese: 390 × 844, dark theme. Both use Playwright headless Chromium 159.0.8154.6, device scale 1 and the same synthetic board data.
- Three boards (Editorial, Publishing and Intake), eight tickets, board-specific tags, original Markdown comments and an embedded PNG. Existing user data is not part of the fixture.

The baseline has no custom-view route: the corresponding request returns 404. There is therefore no before image of that new screen. The before images show the existing board List and ticket detail used to inspect the same tickets. The after images include both those existing screens and the new collection screen.

## Reproduction and expected results

1. Open the Editorial and Publishing boards in List mode, then open the Publishing notice. Verify the stored body, comment and attachment.
2. Create a saved view targeting all boards. Select the two review tags on Editorial and the release tag on Publishing; leave Intake unconfigured. Use open tickets with both original-text panes enabled.
3. Open the view. Expect three distinct tickets, board counts of 2, 1 and 0, and an explicit unconfigured state for Intake. One ticket matching two tags appears only once. The latest comment has its posting time; a ticket without comments says so.
4. Open the Publishing ticket from the view. Enter a comment draft, cancel dismissal, then submit the comment. Verify the stored comment through the API and return to the same row. Posting a comment preserves the lane and tags.
5. Change that ticket to its completed lane. Returning to the open-only view removes it, updates the count and focuses the preceding matching row. Reloading uses the saved definition.
6. Edit the view. Each board has independent tag controls and explicit unconfigured, tag-filter and no-tag-filter choices.

Screenshots establish appearance only. API comparisons and browser regression tests establish saving, ordering, draft preservation, focus recovery and response-race behavior.

## Original images

| State | Before | After |
| --- | --- | --- |
| English Publishing List | [Original](before-en-light-publishing-list.png) | [Original](after-en-light-publishing-list.png) |
| English Publishing detail | [Original](before-en-light-publishing-detail.png) | [Original](after-en-light-publishing-detail.png) |
| Japanese narrow Publishing List | [Original](before-ja-dark-publishing-list.png) | [Original](after-ja-dark-publishing-list.png) |

New saved view: [English light](after-en-light-custom-view.png), [Japanese narrow dark](after-ja-dark-custom-view.png).

Settings: [English light](after-en-light-view-settings.png), [Japanese narrow dark](after-ja-dark-view-settings.png).

Interaction sequence: [cancelled dismissal preserves the draft](after-en-light-draft-kept.png) → [submitted comment and restored focus](after-en-light-comment-saved.png) → [manual completion removes the match and restores nearby focus](after-en-light-moved-focus.png).

Both viewport checks recorded zero horizontal overflow and no browser or HTTP errors. Stored comment content, unchanged tags and lane after comment submission, explicit lane change, resulting counts and reload were checked separately through the API and browser. The Japanese existing List pair is byte-identical because its sidebar is collapsed.

## Data preservation

An online SQLite backup and attachment copy were taken from the v1.3.0 fixture before opening it with the candidate. After upgrade, all three logical board exports and the attachment bytes matched. The candidate preserved the saved definition across restart. Restoring the pre-upgrade backup into v1.3.0 preserved the old data; restoring an upgraded backup into the candidate also preserved the saved view. Single-board exports remained unchanged by saving a global view.

## Scope and limitations

Automated Chromium checks are not human usability validation or verification on every browser and operating system. Synthetic delayed responses exercise races; they are not measurements of a production network. The local compiled application checks are implementation evidence, not a release-image verification. Original text is shown as Markdown text in the list. Archived tickets are excluded and results are paged.
