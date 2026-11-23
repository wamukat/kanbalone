# Cross-board custom views

A named view collects tickets that match a set of board-specific rules. Its list groups tickets by their owning board. SQLite stores the definition so another browser using the same server can open it. A full database backup preserves the definitions and their references. Single-board JSON exports contain board data only.

## Membership and ordering

The scope selects candidate boards. An **all boards** scope includes boards created later. A **selected boards** scope uses the saved board IDs. Within the scope, each board contributes tickets according to its own rule.

| Rule for the board | Tickets contributed |
| --- | --- |
| No rule yet | Zero, with an unset warning |
| Tags selected | Any ticket with at least one selected tag belonging to this board |
| All tags switched off | Zero |
| Explicitly show tickets with any or no tags | All tickets in the selected completion state |

Archived tickets are excluded. Completion follows the owning lane. Each matching ticket appears once. Board, lane and ticket positions determine the order, with IDs breaking ties. Adding a comment can change the preview while preserving the ticket's position.

Rules retain board and tag IDs. New references in a saved definition must identify an existing board and its own tags. A rename changes the displayed name. A deletion leaves a warning, and a newly created tag with the same name has its own ID. An edit can retain the original missing reference until the user removes it. If one tag in an OR rule disappears, its surviving matches still count. Counts use the same membership conditions as the rows and include candidate boards with zero matches.

## Reading and editing

The [API contract](../openapi.yaml) defines the saved-view operations, board/tag catalog and paged query. The query accepts a definition, so temporary display changes can be applied immediately. Body and latest-comment previews are independent. Each excerpt starts at the beginning of the original Markdown. The latest comment is determined by creation time and then comment ID. Expanding an excerpt requests the original text for that ticket body or specific comment.

Saving or deleting uses the version that the browser last read. A stale version returns a conflict. If another client already deleted the view, the server reports that the view is missing. Revert and reload use the saved display settings. A round trip through ticket details preserves temporary display settings.

Opening a title uses the usual ticket editor with its owning board's lanes and tags. The view holds the return location separately from the editor's board context. Closing the editor refreshes membership and counts and returns focus to the originating row when available. If it disappears, focus moves to the next row, then the preceding row, then the view heading. Posting a comment and changing a lane remain independent actions.

The paged query returns exact totals for the full result and bounded excerpts for the requested page. A stale cursor requires restarting the query. Server-sent events invalidate the list when board data or a saved definition changes. The browser also reconciles on reconnect, return to the page and exit from details. Refreshes discard responses for superseded requests and preserve editor drafts.
