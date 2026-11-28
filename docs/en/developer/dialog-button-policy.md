# Dialog Button Policy

This document defines the footer actions for Kanbalone dialogs.

## Inventory

| Dialog | Mode / Trigger | Footer Buttons | Current Order | Notes |
| --- | --- | --- | --- | --- |
| Ticket dialog | New ticket | Save, Cancel | right: Save, Cancel | No destructive action until the ticket exists. |
| Ticket dialog | Edit existing ticket | Delete, Archive/Restore, Move, Save, Cancel | left: Delete, Archive/Restore, Move / right: Save, Cancel | Left actions appear when applicable; Move is the existing cross-board action. |
| Ticket dialog | View existing ticket | Add Comment | right: Add Comment | Edit is a header action because it changes dialog mode. Comment edit/delete are per-comment row actions. |
| UX confirm dialog | Delete Board | Delete, Cancel | right: Delete, Cancel | Destructive confirmation. |
| UX confirm dialog | Delete Lane | Delete, Cancel | right: Delete, Cancel | Destructive confirmation. |
| UX confirm dialog | Delete Ticket | Delete, Cancel | right: Delete, Cancel | Destructive confirmation. |
| UX confirm dialog | Delete selected tickets | Delete, Cancel | right: Delete, Cancel | Bulk destructive confirmation. |

## Policy

1. Footer actions are grouped by risk and commitment.
2. Destructive secondary actions that are available without an extra confirmation sit on the left.
3. Cancel/dismiss actions sit in the right action group, immediately after the confirming action.
4. The confirming action comes first in its right-aligned group, in both DOM and visual order. Do not use positive tabindex or CSS reordering.
5. Confirmation dialogs use only `Cancel` and the destructive confirming action on the right.
6. Header close buttons only dismiss the dialog. They do not duplicate footer cancel buttons semantically.
7. Inline actions that affect a local section, such as comment edit/delete or Archive/Restore, stay near the content they affect instead of moving to the footer.
8. Lightweight name-editing and tag-management flows should stay inline rather than opening a dialog.
9. Destructive confirmation dialogs must state the target, list the deleted data, and show whether the action can be undone.

## Button Semantics

| Role | Placement | Style | Examples |
| --- | --- | --- | --- |
| Primary commit | Right group, before dismiss | `.primary-action` | Save, Create, Add Comment |
| Secondary dismiss | Right group, after primary | `.ghost` | Cancel |
| Destructive immediate | Left | `.danger.action-with-icon` with trash icon | Delete in Edit Ticket |
| Destructive confirmation | Before Cancel in confirm dialog | `.danger.action-with-icon.danger-confirm-action` with trash icon | Delete Board, Delete Lane, Delete Ticket, Delete selected tickets |
| Header mode/action | Header right | icon button | Edit ticket, Close dialog |
| Inline scoped action | Near affected content | icon or small ghost button | Comment edit/delete, Archive/Restore, Board rename, Tag create/edit/delete |

## Implementation Rules

- Use `.editor-actions` as the footer container.
- Place destructive immediate actions as direct children of `.editor-actions`.
- Wrap cancel and primary actions in `.editor-actions-right`.
- Do not place a single primary footer button directly in `.editor-actions`; wrap it in `.editor-actions-right` so it aligns right.
- Apply `.primary-action` to Create, Save, and other non-destructive commit buttons.
- Render all Delete buttons with the Lucide `trash-2` icon.

## Keyboard confirmation and reviewed consumers

Ctrl+Enter / Cmd+Enter invokes the visible, enabled confirming action within the active dialog or editing form. Native input validation still applies. Composition, repeats and pending submissions cannot confirm. The action's accessible shortcut and tooltip describe it without a persistent extra label. Escape and cancellation keep their existing meaning.

Destructive confirmations always initially focus Cancel, even though Delete appears first. Close-only notices cannot confirm. Group conflict dialogs retain their named Group choices: their hidden generic Save cannot be invoked by the shortcut. Forms initially focus their first visible field, or Cancel when there is no field.

| Consumer | Confirmation / order | Preserved distinction |
| --- | --- | --- |
| Focused Kanban/List ticket | Lane → Move → Cancel; M opens | Same-board single-ticket action; list selection is unchanged. |
| Shared UX form | Fields → confirm → Cancel | Bulk move, cross-board move, Group removal and language-change confirmation retain their own effects. |
| Shared destructive UX | Delete → Cancel | Initial focus stays on Cancel; existing preflight, affected-data explanation and asynchronous error remain. |
| Ticket create/edit | Save → Cancel | Existing Save shortcut and unsaved-change protection. |
| Remote issue import sheet | Import → Preview → Cancel | Shortcut imports only after a valid preview; it never runs Preview implicitly. |
| Detail body and Task editing | Save/Add → Cancel | Existing section-specific save shortcut and draft protection. |
| Comment edit / inline deletion | Save/Delete → Cancel | Edit shortcut saves only that comment; deletion initially focuses Cancel and only confirms within the visible confirmation. |
| Comment composer | Add Comment | Existing shortcut remains scoped to the composer. |
| Close-only notice / Group conflict | Close / named choices | No generic shortcut confirmation when the shared submit is hidden. |

Sidebar name/tag editors, the main-page custom-view settings form and operation-updater settings are inline page forms, not dialogs. They retain their existing Enter/blur/save controls. Their action locations were reviewed; this change does not add dialog behavior to those controls.

Representative regressions: `keyboard-lane-dialogs.spec.ts`, `ticket-editor-remote-import.spec.ts`, `groups.spec.ts`, `lane-deletion.spec.ts`, `create-keyboard.spec.ts`, `image-attachments.spec.ts`.
