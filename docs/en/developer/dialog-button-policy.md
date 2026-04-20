# Dialog Button Policy

This document defines the footer actions for Kanbalone dialogs.

## Inventory

| Dialog | Mode / Trigger | Footer Buttons | Current Order | Notes |
| --- | --- | --- | --- | --- |
| Ticket dialog | New ticket | Cancel, Save | right: Cancel, Save | No destructive action until the ticket exists. |
| Ticket dialog | Edit existing ticket | Delete, Cancel, Save | left: Delete / right: Cancel, Save | Archive / Restore is an inline field action, not a footer action. |
| Ticket dialog | View existing ticket | Add Comment | right: Add Comment | Edit is a header action because it changes dialog mode. Comment edit/delete are per-comment row actions. |
| UX confirm dialog | Delete Board | Cancel, Delete | right: Cancel, Delete | Destructive confirmation. |
| UX confirm dialog | Delete Lane | Cancel, Delete | right: Cancel, Delete | Destructive confirmation. |
| UX confirm dialog | Delete Ticket | Cancel, Delete | right: Cancel, Delete | Destructive confirmation. |
| UX confirm dialog | Delete selected tickets | Cancel, Delete | right: Cancel, Delete | Bulk destructive confirmation. |

## Policy

1. Footer actions are grouped by risk and commitment.
2. Destructive secondary actions that are available without an extra confirmation sit on the left.
3. Cancel/dismiss actions sit in the right action group, immediately before the confirming action.
4. The confirming action is always the rightmost footer button.
5. Confirmation dialogs use only `Cancel` and the destructive confirming action on the right.
6. Header close buttons only dismiss the dialog. They do not duplicate footer cancel buttons semantically.
7. Inline actions that affect a local section, such as comment edit/delete or Archive/Restore, stay near the content they affect instead of moving to the footer.
8. Lightweight name-editing and tag-management flows should stay inline rather than opening a dialog.
9. Destructive confirmation dialogs must state the target, list the deleted data, and show whether the action can be undone.

## Button Semantics

| Role | Placement | Style | Examples |
| --- | --- | --- | --- |
| Primary commit | Rightmost | `.primary-action` | Save, Create, Add Comment |
| Secondary dismiss | Right group, before primary | `.ghost` | Cancel |
| Destructive immediate | Left | `.danger.action-with-icon` with trash icon | Delete in Edit Ticket |
| Destructive confirmation | Rightmost in confirm dialog | `.danger.action-with-icon.danger-confirm-action` with trash icon | Delete Board, Delete Lane, Delete Ticket, Delete selected tickets |
| Header mode/action | Header right | icon button | Edit ticket, Close dialog |
| Inline scoped action | Near affected content | icon or small ghost button | Comment edit/delete, Archive/Restore, Board rename, Tag create/edit/delete |

## Implementation Rules

- Use `.editor-actions` as the footer container.
- Place destructive immediate actions as direct children of `.editor-actions`.
- Wrap cancel and primary actions in `.editor-actions-right`.
- Do not place a single primary footer button directly in `.editor-actions`; wrap it in `.editor-actions-right` so it aligns right.
- Apply `.primary-action` to Create, Save, and other non-destructive commit buttons.
- Render all Delete buttons with the Lucide `trash-2` icon.
