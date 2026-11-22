# Kanban keyboard focus and Group candidate navigation

Baseline revision `12a100e70e1666169ad902c13680f15df0d33829`. The candidate keeps a direct Kanban title lookup and reuses rendered Group option nodes while navigating. Candidate JavaScript SHA-256 values are `8fe3875dec56dec752d0d860f665b4910c77e63093cb2a8ce3b855bf609131f9` for `app-board-keyboard.js` and `76fe92c4cc8c0019b013d473bad82e625f980a86aa82544d20274951f9817653` for `app-group-board.js`.

The two applications reported Kanbalone 1.1.0 and used separate copies of the same synthetic SQLite fixture. Fixture SHA-256 is `c693342296088324d35caf03b0cf07c734154309e5ab412c6bf5a341bf5b1c88`. Timing used Chromium 159.0.8154.6, Node 26.13.1, localhost, Intel Core i7-9750H macOS x64, 1440 × 900, English, and light mode on 2026-11-23 JST. Hosts issued real keyboard and mouse input. Timing started before dispatch and ended after the expected focus, query, or selection state plus two animation frames. The raw records also capture trusted event timestamps and browser-side measurements. The first sample in each repeated scenario warmed up the action and is excluded. A fresh process, context and database copy began each variant. Each variant recorded 86 samples.

## #1535 Kanban keyboard navigation and detail return

| Operation | Baseline median [min–max] | Candidate median [min–max] | Samples per version |
|---|---:|---:|---:|
| 1,000 active, search to first result | 41.9 [38.5–70.0] ms | 38.0 [34.7–52.5] ms | 7 |
| 1,000 active, detail close | 71.1 [55.9–82.2] ms | 48.6 [47.1–65.1] ms | 7 |
| 3,000 active, search to first result | 80.4 [68.7–105.7] ms | 56.0 [39.6–91.3] ms | 7 |
| 3,000 active, detail close | 82.4 [76.2–85.1] ms | 64.8 [57.1–77.8] ms | 7 |
| 3,000 active, detail close after an SSE update | 884.7 ms | 819.9 ms | 1 |
| 3,000 active, all cards rendered after that close | 2,889.5 ms | 2,639.8 ms | 1 |

Open the populated Kanban board, focus Search and press Down. The first visible ticket title receives focus. Focus the late ticket title, press Enter, then press Escape. Focus returns to the same title and saved lane and window scroll positions. The completion lane stays collapsed. GET returns the original ticket after read-only viewing. For the SSE case, an independent local PATCH changes the title with the detail open. Closing restores the late title and its updated text as soon as its render batch arrives. In the 3,000-active case 1,080 of 3,005 cards were rendered at focus return in both versions. Wait for the full board separately. The final test narrows the search to one ticket while active, opens detail, and patches the title to leave the query. Escape returns focus to Search, preserves the query, and the API confirms the new title.

The candidate changes the keyboard lookup. First detail-open elapsed 88.5 ms on 1,000 active and 137.1 ms on 3,000 active in one sample each. The original 3,000-active single sample was 123.6 ms. General detail load timing varies separately from focus return.

## #1537 Group candidate keyboard navigation

| Operation | Baseline median [min–max] | Candidate median [min–max] | Samples per version |
|---|---:|---:|---:|
| 1,000 matches, ArrowDown | 52.5 [49.0–64.7] ms | 47.9 [46.7–49.8] ms | 7 |
| 1,000 matches, ArrowUp | 53.8 [46.2–65.9] ms | 46.2 [44.7–48.3] ms | 7 |
| 10,000 matches, ArrowDown | 529.0 [500.2–572.2] ms | 47.5 [46.4–48.6] ms | 7 |
| 10,000 matches, ArrowUp | 510.8 [492.5–625.9] ms | 47.3 [45.4–48.1] ms | 7 |
| 10,000 matches, ArrowDown browser key handler | 110.4 [106.5–126.7] ms | 0.1 [0.0–0.2] ms | 7 |
| 10,000 unassigned candidates, first picker open | 743.0 ms | 740.8 ms | 1 |
| 10,000 matches, rebuild for the next ordinary text key | 607.4 ms | 588.2 ms | 1 |

Open the existing Group, pick Add existing ticket and search for `Performance ticket`. All 1,000 or 10,000 options render in the original order, including the archived candidate. Press Down and Up, including wrapping at the boundaries. DOM focus stays on the combobox and the selected option reference tracks the navigation. The option order hashes match in both variants. Repeat with the board scrolled to 96 px and confirm that the original position persists. Escape clears the query and hides suggestions. Enter with no result leaves membership unchanged. Search by child ticket ID, press Enter, and verify that the selected chip represents the parent and child family. Cancel and verify both remain unassigned through GET. Open and select the child again, submit, then confirm membership and parent ID via GET and reload. The new behavior clears the previous active-descendant reference when the query changes and sets it again on the next arrow key.

These browser measurements demonstrate local response on the tested fixtures. Single measurements of initial loading, query replacement, and queued refresh are sensitive to I/O and frame scheduling. The data contains synthetic tickets and no external provider calls. Candidate key handling is faster than a typical frame interval on this machine. The end-to-end +2-frame metric has a separate lower bound and the full 10,000-option query still builds and lays out every matching option. Human and assistive technology sessions were outside this verification.

Raw records are [baseline](baseline-both-79892.json), [candidate](candidate-both-79945.json), and [summary](summary.json). The baseline serves the original `public` files. Both serve the same backend.

## Final Group input guard and image evidence

The local public JavaScript type check identified that the delegated input event also accepts textareas. The final Group revision explicitly verifies that this combobox event comes from an HTMLInputElement. The final `app-group-board.js` SHA-256 is `9a3379115e3760494d55f3cf7d8f1bfb09d8a811791ea0b8ca09eb6d8086908b`. The final-source candidate-only rerun passed all 46 Group samples and interaction checks. Against the baseline, the final 10,000-match ArrowDown median was 46.4 [44.8–48.5] ms and ArrowUp was 47.1 [45.4–49.7] ms with seven samples each. The first 10,000-candidate open was 640.3 ms and the broad text update was 478.3 ms in single observations. Details are in `candidate-group-81217.json`.

Captured 20 baseline/candidate pairs in the actual app using agent-browser 0.26.0. English images use 1440 × 900 light mode. Japanese images use 390 × 844 dark mode. The screenshots come from fresh fixture copies at each revision with the same viewport, locale, and sequence. All eight Kanban pairs are pixel-identical. Nine of twelve Group pairs are pixel-identical. Each remaining Group pair differs by the 17 pixels of the blinking input caret. The input caret is visible in selected natural captures. The original images are untouched. The two screenshots of Group submission and reload document separate states. The screenshot runner verifies focus, scroll, and persisted fields separately from the PNGs.

The JSON manifest `image-pairs.json` records the original filenames, SHA-256, dimensions, and pixel comparison. The two `screen-*-both.json` files record captured states and persisted before/cancelled/reloaded fields. Representative original images are linked below. The ticket records carry additional original captures.

The local public JavaScript type check and git diff whitespace check pass. The focused E2E run passed 23 tests across keyboard navigation, Group membership focus, partial renders, and Group UI. The final typed Group input guard has additional browser verification through the 46-sample rerun and the final before/after workflow captures.

The Kanban change and its test are committed at `c54b1ebc4359257abc891f51fac541da0a855081`. The Group change and its test are committed at `4c3793114ac9609b6d9f4acadacfc1399302db85`.

## Representative images

| Step | English baseline | English candidate | Japanese baseline | Japanese candidate |
| --- | --- | --- | --- | --- |
| Before moving focus from search | [Search](screens/1535-baseline-en-light-1440-kanban-search.png) | [Search](screens/1535-candidate-en-light-1440-kanban-search.png) | [Search](screens/1535-baseline-ja-dark-390-kanban-search.png) | [Search](screens/1535-candidate-ja-dark-390-kanban-search.png) |
| Restore title focus after closing detail | [Focused title](screens/1535-baseline-en-light-1440-kanban-focus-return.png) | [Focused title](screens/1535-candidate-en-light-1440-kanban-focus-return.png) | [Focused title](screens/1535-baseline-ja-dark-390-kanban-focus-return.png) | [Focused title](screens/1535-candidate-ja-dark-390-kanban-focus-return.png) |
| Arrow down in the Group picker | [Focused candidate](screens/1537-baseline-en-light-1440-group-arrow-down.png) | [Focused candidate](screens/1537-candidate-en-light-1440-group-arrow-down.png) | [Focused candidate](screens/1537-baseline-ja-dark-390-group-arrow-down.png) | [Focused candidate](screens/1537-candidate-ja-dark-390-group-arrow-down.png) |
| Reload after saving Group membership | [Parent and child](screens/1537-baseline-en-light-1440-group-saved-after-reload.png) | [Parent and child](screens/1537-candidate-en-light-1440-group-saved-after-reload.png) | [Parent and child](screens/1537-baseline-ja-dark-390-group-saved-after-reload.png) | [Parent and child](screens/1537-candidate-ja-dark-390-group-saved-after-reload.png) |

The integrated product changes at `10315ac9fa7e7cfaa6b73f84e153de1b6c3469ca` contain the same Kanban and Group picker patches. Independent review checked the integrated code and the representative original images in both languages.

## Reproduction

In the candidate checkout with Node 26, Playwright Chromium, and agent-browser installed:

```sh
output=coverage/subsecond-input
evidence=docs/development/evidence/2026-11-23-input-navigation
mkdir -p "$output/baseline-public"
git archive 12a100e70e1666169ad902c13680f15df0d33829 public | tar -xf - -C "$output/baseline-public" --strip-components 1
cp "$evidence/probe.mjs" "$evidence/capture.mjs" "$evidence/evidence.mjs" "$output/"
node --import tsx "$output/probe.mjs" baseline both 7
node --import tsx "$output/probe.mjs" candidate both 7
node "$output/capture.mjs"
```

The probe seeds an isolated SQLite fixture. Its generated cursor signing secret can change the byte hash between independently created fixtures. Both runs copy the same fixture and perform the same operations.
