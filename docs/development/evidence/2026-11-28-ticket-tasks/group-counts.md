# Task completion counts in Group

The captures show the same three tickets in **リリース確認** on a separate synthetic board. Both builds display Kanbalone v1.6.0. Agent-browser 0.26.0 captured Japanese light and dark modes on Chromium 158 at 1440 × 900 and device scale 1 on November 28, 2026 JST.

| State | Before | After |
| --- | --- | --- |
| Japanese light, same Group | [Before](before-ja-light-group-counts.png) | [After](after-ja-light-group-counts.png) |
| Japanese dark, same Group | [Before](before-ja-dark-group-counts.png) | [After](after-ja-dark-group-counts.png) |

After the change, the first and third rows show **1/2済み** and **0/1済み** directly beneath their titles. The middle ticket has no Tasks and shows no count. The Group header still counts tickets independently of Task completion.

## Reproduce and verify

1. Create a Group with three tickets. Add one completed and one open Task to the first ticket. Leave the second ticket without Tasks and add one open Task to the third. Open the Group on baseline commit `558e4a8c7eae17278a2a2b584f5a67ce346f5298`. The individual tasks exist and the Group rows have no Task counts.
2. Start the candidate on the same database and open the same Group. Check the three title rows in both themes. The Group projection now returns counts of 1/2, 0/0 and 0/1. The previously returned row fields and the stored Task payloads match the baseline.
3. From the first Group row, open the ticket and complete Task #2. Close the ticket. The row changes to **2/2済み** in both the current tab and a second open Group tab without reloading. The Task API returns `done: true` at revision 2 and the Group projection reports two completed Tasks. The parent ticket remains open, and the other two rows retain their states. See the [updated Group capture](after-ja-light-group-counts-updated.png).

The [manifest](group-counts-manifest.json) records the two runtime fingerprints and all five original image hashes.
