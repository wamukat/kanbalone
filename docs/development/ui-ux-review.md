# UI/UX review rules

Kanbalone is a small personal work board shared by a person and their AI tools. Changes should help people capture work, understand its current state, review progress, and return to work without extra ceremony.

## Existing interface is the baseline

- Keep board navigation and Kanban / List / Group in the sidebar. Group contents belong in the content area.
- Reuse the existing white panels, subdued borders, green selection/action color, semantic warning colors, typography, icons, and spacing tokens. Do not introduce a second visual system.
- Use existing metadata rows for lane, Group, priority, and dependency information. Add controls only when they enable a necessary action.
- Keep frequent actions close to their content. Board configuration stays in the gear area; lane names remain editable on the lane.
- Preserve action positions when selection, archive visibility, loading, or filter state changes. Measure the whole control and adjacent controls, not only its label.
- Keep icon meanings consistent and provide accessible names and tooltips. Sort controls retain direction arrows.
- A ticket belongs to at most one Group. Related parent/child tickets share membership. Moving between Groups uses remove, then add. Do not add a one-off Undo or Group search without a separate product decision.

## Evaluation procedure

1. State the user's task, starting data, viewport, expected result, and reason the action matters.
2. Record the actual visible behavior and evidence. Separate observation, interpretation, and proposed change.
3. Check the relevant states: initial, selected, loading, success, failure, empty, cancelled, and reopened. Include keyboard use, narrow width, and dark mode where affected.
4. Compare the smallest viable change with the current behavior. Reuse existing controls before adding new ones.
5. Have another reviewer inspect the implementation and actual screenshots. Resolve actionable findings and rerun affected checks.
6. Repeat the same task with the same data and viewport. Verify stored results as well as the visible outcome.
7. Record accept / reject / defer with reasons. Unexecuted checks remain unverified, with a next step.

Automated regression tests support this procedure; they do not establish that people find the interface understandable. AI persona simulations generate hypotheses, not evidence of a person's thoughts or feelings. Do not invent task times, click counts, or participant results. A mean score must not hide wrong-target writes or lost input.

## Per-ticket image evidence (required)

Every UI/UX ticket must have before-and-after images attached in its Kanbalone record before entering Acceptance or completion. A text-only test report, a file path, or an aggregate screenshot does not meet this requirement.

- Capture the actual UI using the same starting data, viewport, theme, and equivalent action/state. Record the baseline tag/commit and the changed revision or working-tree fingerprint.
- Include at least one labelled before image and one labelled after image per ticket. Use additional frames for input → action → result when a single frame cannot demonstrate the issue.
- Record the steps, expected result, observed difference, capture date, environment, and relevant persisted-state checks. Label simulated external adapters and injected failures.
- Keep the original captures unaltered. Annotated crops may supplement, but must not replace, the original context.
- Verify that embedded images actually load from the ticket. Store reproducible evidence outside disposable test output; document any local-only hosting requirement.
- If the baseline cannot be reproduced, explain why and keep the evidence requirement pending. Do not recreate a purported screenshot by editing pixels or inventing browser state.
- A reviewer checks whether the images support the stated result. Images do not replace behavior tests or human usability validation.

## Safety and feedback gates

- No unintended board or ticket updates, including when requests resolve out of order.
- Unsaved ticket edits survive cancelled dismissal and failed saves. Programmatic close after successful saving remains possible.
- In-flight mutations keep their initiating ticket identity. Prevent conflicting actions or ignore stale responses.
- Empty results explain the applicable conditions and offer an existing recovery action.
- Status must remain meaningful when the underlying item is filtered out or archived.
- Confirm destructive effects when needed; do not ask on every ordinary action.
- Feedback says what was observed. A browser download being started is not proof that a file was saved on disk.

## Next human validation

Use representative tasks with people who capture personal work, develop with AI, review completed work, and maintain boards. Start with a small practical sample (for example, five participants), without treating it as a statistical guarantee. Have them try the same before/after tasks in counterbalanced order. Observe completion, mistakes, recovery, hesitation, and their own explanation of the result. Prioritize Move, unsaved edits, dependency visibility, and Group empty states. Record findings and update the Kanbalone tickets before release decisions.

## Sources

- [PKSHA: AI usability evaluation](https://zenn.dev/pksha/articles/8f4d45b913ed50): connect specific states and criteria to evidence, including unverified conditions.
- [TOHFU: UX evaluation with AI skills](https://note.com/tohfu_tronica/n/ne52d958944b6): distinguish heuristic review, machine checks, and simulated behavior.
- [ZimaSpace: UI/UX design skills and tools](https://shop.zimaspace.com/ja/blogs/tech-ai-hub/10-best-ai-design-skills-tools-for-better-ui-ux): separate style discovery, design proposals, and validation; tool rankings are not product evidence.

The detailed 2026-11-21 task plan is tracked in local Kanbalone #1486, with findings #1474–#1485. Its local evidence is under `coverage/ux-improvement-plan-20261121/` and `coverage/ux-improvement-20261121/`; these generated artifacts are not distributed documentation.
