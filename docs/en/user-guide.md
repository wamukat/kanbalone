# SoloBoard User Guide

SoloBoard is a lightweight kanban tool for personal work, small release planning, and collaboration with AI agents.

This guide follows the order a new user can use to start working.

## Quick Demo

This short demo shows ticket creation with Markdown, creating and attaching a tag, drag and drop, search, filters, comments, and List view.

![SoloBoard demo](../assets/soloboard-demo.webp)

## 1. Create Your First Board

Click the `+` in the upper-left sidebar to show the board name input.

Type a board name and press Enter to create your first board.

![Initial empty board](../assets/user-guide/00-initial-empty-board.png)

![Inline board create](../assets/user-guide/02-inline-board-create.png)

## 2. Learn The Workspace

After creating a board, the workspace appears.

Choose a board in the left sidebar and move tickets in the central Kanban area. Use `Kanban` / `List` in the sidebar to switch views.

![Kanban overview](../assets/user-guide/01-kanban-overview.png)

## 3. Set Up Lanes

Use the `+` at the bottom of the board to add a lane. Type the lane name and press Enter.

Rename and delete actions are available from each lane's action button.

![Inline lane create](../assets/user-guide/03-inline-lane-create.png)

## 4. Create A Ticket

Use the `+` in a lane to create a ticket.

Enter a title and body. You can also set Lane / Priority, Tags, and Relations.

Main fields:

- Title
- Body written in Markdown
- Lane / Priority
- Tags
- Relations

Relations let you set blockers and a parent ticket.

![Ticket create dialog](../assets/user-guide/04-ticket-create-dialog.png)

## 5. Read A Ticket

Click a ticket to open its detail view.

The detail view shows the body, relationships, comments, and activity.

![Ticket detail comments](../assets/user-guide/05-ticket-detail-comments.png)

## 6. Edit A Ticket

Use the pencil icon in the upper-right of the detail view.

You can change Lane / Priority / Resolved, Tags, Relations, and the body.

Relations let you edit blockers, parent tickets, and child tickets.

![Ticket edit relations](../assets/user-guide/07-ticket-edit-relations.png)

## 7. Use Comments And Activity

You can leave comments in the ticket detail view.

The `Activity` tab shows history such as comment creation, updates, and deletion.

![Ticket activity](../assets/user-guide/06-ticket-activity.png)

## 8. Resolve And Organize Tickets

You can mark finished work Resolved. You can also move it to a Done lane.

Archive tickets you no longer need to see every day. Archived tickets are hidden from the normal board.

Open `Status >` to the right of the tag filter and add `Archived` when you need to include archived tickets. You can add `Resolved` from the same menu. Use the `x` icon inside the filter to clear that filter.

![Archived filter](../assets/user-guide/11-archived-filter.png)

## 9. Find Tickets

The search field can filter by keyword and ticket number.

- Search title and body with a keyword such as `login`.
- Search ticket numbers with `#123` or `123`.

Open `Priority >` in the filter area when you want to filter by priority. You can select multiple values: Low, Medium, High, and Urgent.

When the search field has a value, use the `x` on the right to clear it.

![Search clear button](../assets/user-guide/14-search-clear.png)

## 10. Classify Work With Tags

Use the tag filter to show only tickets for a specific theme.

Create tags from the `+` in the sidebar Tags section. Click a tag badge later to edit its color.

When editing a ticket, type a new tag name in the Tags field and press `+` to create it as a no-color tag.

![Tag filter](../assets/user-guide/10-tag-filter.png)

## 11. Review In List View

Switch to `List` in the sidebar to review tickets in a table.

List view shows Resolved / Archived state and priority in columns.

![List view](../assets/user-guide/08-list-view.png)

Select tickets in List view to show bulk actions.

You can mark multiple tickets Resolved, reopen them, Archive them, or Restore them.

![List bulk actions](../assets/user-guide/09-list-bulk-actions.png)

## 12. Use Board Settings

Board rename, Export / Import, and Delete are available from the gear at the bottom of the sidebar.

Open the gear and click the pencil icon next to the board name to edit the name in place. Press Enter to save, or press Esc / move focus away to cancel.

![Board settings](../assets/user-guide/12-board-settings.png)

## 13. Dark Mode

SoloBoard does not have an in-app Light / Dark toggle.

It follows the OS or browser color-scheme setting. When your system is in dark mode, SoloBoard uses the dark theme.

![Dark mode](../assets/user-guide/13-dark-mode.png)

## Try With Docker

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.13
```

Open:

```text
http://127.0.0.1:3000
```

Data is stored at `/app/data/soloboard.sqlite`. With a Docker named volume, data survives container recreation.

SoloBoard does not include authentication. Do not expose it directly to untrusted networks.
