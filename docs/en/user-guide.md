# SoloBoard User Guide

SoloBoard is a lightweight kanban tool for personal work, small release planning, and collaboration with AI agents.

You can manage tickets, comments, tags, blockers, parent/child relationships, resolved state, and archive state in one UI. The same data is also available through a JSON API, so humans can work in the browser while scripts or agents update the board.

## First Launch

The first action is only the `+` in the upper-left sidebar. Follow the `Create board here` guide and click `+`; the board name input appears in place.
Type a board name and press Enter to create your first board.

![Initial empty board](../assets/user-guide/00-initial-empty-board.png)

After creating a board, the normal workspace appears: Kanban / List switching, search, Resolved, tag, and Archived filters.

![Kanban overview](../assets/user-guide/01-kanban-overview.png)

## First Things To Use

Choose a board in the left sidebar and move tickets in the main area. The toolbar includes search, Resolved, tag, and Archived filters.

- `Kanban` shows ticket flow by lane.
- `List` is useful for reviewing and updating many tickets at once.
- Tags also appear in the sidebar so you can quickly find board themes.

## Create A Board

Click `+` in the upper-left sidebar. An inline input appears in the board list. Type a name and press Enter to create the board.

Press Esc to cancel. Leaving the field empty and moving focus away also cancels creation.

![Inline board create](../assets/user-guide/02-inline-board-create.png)

## Add A Lane

Use the `+` at the bottom of the board to add a lane. Like board creation, enter the lane name inline and press Enter.

Rename and delete actions are available from each lane's action menu. Infrequent actions stay slightly deeper so the board remains quiet while reading it.

![Inline lane create](../assets/user-guide/03-inline-lane-create.png)

## Create A Ticket

Use the `+` in a lane to create a ticket.

Main fields:

- Title
- Body written in Markdown
- Lane / Priority
- Tags
- Relations

Relations let you set blockers and a parent ticket. Adding relationships when creating a ticket makes the context easier to follow later.

![Ticket create dialog](../assets/user-guide/04-ticket-create-dialog.png)

## Read A Ticket

Click a ticket to open its detail dialog.

The detail view shows the body, relationships, comments, and activity. Long tickets scroll with the page instead of adding small nested scrollbars inside the dialog.

![Ticket detail comments](../assets/user-guide/05-ticket-detail-comments.png)

## Review Activity

The `Activity` tab shows history such as comment creation, updates, and deletion.

This helps you review what changed before a release, even when working alone.

![Ticket activity](../assets/user-guide/06-ticket-activity.png)

## Edit A Ticket

Use the pencil icon in the upper-right of the detail view.

Lane / Priority / Resolved are shown on the same row. Resolved is separate from the lane, so being in a Done lane and being Resolved are different states.

Relations lets you edit blockers, parent tickets, and child tickets.

![Ticket edit relations](../assets/user-guide/07-ticket-edit-relations.png)

## Use List View

Switch to `List` in the sidebar to review tickets in a table.

List view is useful when you want to scan by priority or review Resolved / Archive state across many tickets.

![List view](../assets/user-guide/08-list-view.png)

## Bulk Actions

Select tickets in List view to show bulk actions.

You can mark multiple tickets Resolved, reopen them, Archive them, or Restore them.

![List bulk actions](../assets/user-guide/09-list-bulk-actions.png)

## Find Tickets

The search field can filter by keyword, ticket number, and priority.

- Search title and body with a keyword such as `login`.
- Search ticket numbers with `#123` or `123`.
- Show only Priority 3 tickets with `priority:3`.

## Filter By Tag

Use the tag filter to show only tickets for a specific theme.

Tags are useful for documentation, release work, bugs, AI-agent tasks, and other concerns that help keep a growing board understandable.

![Tag filter](../assets/user-guide/10-tag-filter.png)

## Show Archived Tickets When Needed

Archived tickets are hidden by default so you can focus on current work.

Click `Archived` to the right of the tag filter when you need to include archived tickets.

![Archived filter](../assets/user-guide/11-archived-filter.png)

## Board Settings

Board rename, Export / Import, and Delete are available from the gear at the bottom of the sidebar.

They stay hidden during everyday work so you can focus on boards and tickets. Open them only when backing up or moving data.

![Board settings](../assets/user-guide/12-board-settings.png)

## Recommended Workflow

1. Create one board per release or personal project.
2. Start with simple lanes such as `Backlog`, `In Progress`, `Review`, and `Done`.
3. Use tags for work themes.
4. Put blocked work into Blockers.
5. Split larger work with Parent / Children.
6. Review and clean up in List view before weekends or releases.
7. Mark finished work Resolved and Archive items you no longer need to see.

## Try With Docker

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.3
```

Open:

```text
http://127.0.0.1:3000
```

Data is stored at `/app/data/soloboard.sqlite`. With a Docker named volume, data survives container recreation.

SoloBoard does not include authentication. Do not expose it directly to untrusted networks.
