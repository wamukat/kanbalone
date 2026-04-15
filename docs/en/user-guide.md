# SoloBoard User Guide

SoloBoard is a lightweight kanban tool for personal work, small release planning, and collaboration with AI agents.

This guide follows the order a new user can use to start working immediately.

## 1. Create Your First Board

The first action is only the `+` in the upper-left sidebar. Follow the `Create board here` guide and click `+`; the board name input appears in place.

Type a board name and press Enter to create your first board.

![Initial empty board](../assets/user-guide/00-initial-empty-board.png)

![Inline board create](../assets/user-guide/02-inline-board-create.png)

## 2. Learn The Workspace

After creating a board, the normal workspace appears.

Choose a board in the left sidebar and move tickets in the central Kanban area. You can switch between `Kanban` and `List` in the sidebar.

The current UI keeps cards, lanes, filters, and dialogs aligned to the same design rules. Quiet borders, subtle depth, and actions that appear only when needed help keep the board focused on the work itself.

![Kanban overview](../assets/user-guide/01-kanban-overview.png)

## 3. Set Up Lanes

Use the `+` at the bottom of the board to add a lane. Like board creation, enter the lane name inline and press Enter.

A simple workflow such as `Backlog`, `In Progress`, `Review`, and `Done` is enough to start. You can add or rename lanes later.

Rename and delete actions are available from each lane's action menu. Lane rename happens inline on the lane header instead of opening a dialog. Infrequent actions stay slightly deeper so the board remains quiet while reading it.

![Inline lane create](../assets/user-guide/03-inline-lane-create.png)

## 4. Create A Ticket

Use the `+` in a lane to create a ticket.

You can start with only a title and body. Add Lane / Priority, Tags, and Relations when needed.

Main fields:

- Title
- Body written in Markdown
- Lane / Priority
- Tags
- Relations

Relations let you set blockers and a parent ticket. Adding relationships when creating a ticket makes the context easier to follow later.

![Ticket create dialog](../assets/user-guide/04-ticket-create-dialog.png)

## 5. Read A Ticket

Click a ticket to open its detail dialog.

The detail view shows the body, relationships, comments, and activity. Long tickets scroll with the page instead of adding small nested scrollbars inside the dialog.

![Ticket detail comments](../assets/user-guide/05-ticket-detail-comments.png)

## 6. Edit A Ticket

Use the pencil icon in the upper-right of the detail view.

Lane / Priority / Resolved are shown on the same row. Resolved is separate from the lane, so being in a Done lane and being Resolved are different states.

Relations lets you edit blockers, parent tickets, and child tickets.

![Ticket edit relations](../assets/user-guide/07-ticket-edit-relations.png)

## 7. Use Comments And Activity

You can leave comments in the ticket detail view. Use them for work notes, verification results, or instructions for AI agents so the context stays with the ticket.

The `Activity` tab shows history such as comment creation, updates, and deletion.

This helps you review what changed before a release, even when working alone.

![Ticket activity](../assets/user-guide/06-ticket-activity.png)

## 8. Resolve And Organize Tickets

Mark finished work Resolved. Move it to a Done lane when that also fits your workflow.

Archive tickets you no longer need to see every day. Archived tickets are hidden from the normal board so you can focus on current work.

Open `Status >` to the right of the tag filter and add `Archived` when you need to include archived tickets. You can add `Resolved` from the same menu. Use the `x` icon inside the filter to clear that filter.

![Archived filter](../assets/user-guide/11-archived-filter.png)

## 9. Find Tickets

The search field can filter by keyword and ticket number.

- Search title and body with a keyword such as `login`.
- Search ticket numbers with `#123` or `123`.

Open `Priority >` in the filter area when you want to filter by priority. You can select multiple values: Low, Medium, High, and Urgent.

When the search field has a value, use the `x` on the right to clear it immediately. SoloBoard remembers the last board, Kanban/List view, board-specific filters, and the open/closed state of the `Status` and `Priority` menus in your browser, then restores them the next time you open the app.

## 10. Classify Work With Tags

Use the tag filter to show only tickets for a specific theme.

Tags are useful for documentation, release work, bugs, AI-agent tasks, and other concerns that help keep a growing board understandable.

Create tags inline from the `+` in the sidebar Tags section. New tags start with only a name; click the tag badge later when you want to edit its color.

When editing a ticket, type a new tag name in the Tags field and press `+` to create it immediately as a no-color tag. Add color later from the sidebar tag badge when needed.

![Tag filter](../assets/user-guide/10-tag-filter.png)

## 11. Review In List View

Switch to `List` in the sidebar to review tickets in a table.

List view is useful when you want to scan by priority or review Resolved / Archive state across many tickets.

![List view](../assets/user-guide/08-list-view.png)

Select tickets in List view to show bulk actions.

You can mark multiple tickets Resolved, reopen them, Archive them, or Restore them.

![List bulk actions](../assets/user-guide/09-list-bulk-actions.png)

## 12. Use Board Settings

Board rename, Export / Import, and Delete are available from the gear at the bottom of the sidebar.

Opening the gear shows the current board name. Use the pencil icon next to the name to edit it inline.

They stay hidden during everyday work so you can focus on boards and tickets. Open them only when backing up or moving data.

![Board settings](../assets/user-guide/12-board-settings.png)

## 13. Dark Mode

SoloBoard does not have an in-app Light / Dark toggle.

Instead, it follows the OS or browser color-scheme setting. When your system is in dark mode, SoloBoard automatically uses the dark theme. In light environments it stays light; in dark environments it follows the device setting.

![Dark mode](../assets/user-guide/13-dark-mode.png)

## Recommended Workflow

1. Create one board per release or personal project.
2. Start with simple lanes such as `Backlog`, `In Progress`, `Review`, and `Done`.
3. Create tickets with just a title and body at first.
4. Add tags as the work grows.
5. Put blocked work into Blockers.
6. Split larger work with Parent / Children.
7. Review and clean up in List view before weekends or releases.
8. Mark finished work Resolved and Archive items you no longer need to see.

## Try With Docker

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.10
```

Open:

```text
http://127.0.0.1:3000
```

Data is stored at `/app/data/soloboard.sqlite`. With a Docker named volume, data survives container recreation.

SoloBoard does not include authentication. Do not expose it directly to untrusted networks.
