import { renderTag } from "./app-tags.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderRemoteRefBadge } from "./app-remote-provider.js";
import { renderTicketHierarchyIcon } from "./app-ticket-hierarchy.js";

export function renderListRow(entry, options) {
  const { ticket, indent } = entry;
  const tags = ticket.tags
    .map((tag) => renderTag(tag, options.escapeHtml))
    .join("");
  const blockers = options.boardTickets
    .filter((candidate) => ticket.blockerIds.includes(candidate.id))
    .map((blocker) => renderInlineTicketLink(blocker, options.escapeHtml))
    .join(", ");
  const lane = options.lanes.find((item) => item.id === ticket.laneId);
  const statusIcons = options.renderTicketStatusIcons(ticket);
  const externalReferences = (ticket.externalReferences ?? [])
    .map((reference) => renderRemoteRefBadge(reference, options.escapeHtml, "list-ticket-external-ref"))
    .join("");
  return `
    <div class="list-row ${ticket.isResolved ? "resolved" : ""} ${ticket.isArchived ? "archived" : ""}" style="height:${options.rowHeight}px">
      <input type="checkbox" data-list-ticket-id="${ticket.id}" ${options.selectedTicketIds.includes(ticket.id) ? "checked" : ""} />
      <div class="list-ticket-title-cell indent-${indent}">
        ${renderTicketHierarchyIcon(ticket, options.boardTickets, { selectableParent: true })}
        <button type="button" class="list-ticket-link" data-open-ticket-id="${ticket.id}">
          <span class="ticket-id">#${ticket.id}</span>
          <span class="list-ticket-title">${options.escapeHtml(ticket.title)}</span>
          ${ticket.remote ? renderRemoteRefBadge(ticket.remote, options.escapeHtml, "list-ticket-remote-ref") : ""}
          ${externalReferences}
        </button>
      </div>
      <div class="list-cell muted">${blockers || "-"}</div>
      <div class="tag-list">${tags || '<span class="muted">-</span>'}</div>
      <div class="list-cell list-priority-cell">${renderPriorityBadge(ticket.priority) || '<span class="muted">-</span>'}</div>
      <div class="list-cell muted">${options.escapeHtml(lane?.name || "Open")}</div>
      <div class="list-cell list-status-cell">${statusIcons || '<span class="muted">-</span>'}</div>
    </div>
  `;
}

function renderInlineTicketLink(ticket, escapeHtml) {
  return `<button type="button" class="ticket-ref-inline list-relation-ticket-link${ticket.isResolved ? " ticket-ref-resolved" : ""}" data-open-ticket-id="${ticket.id}" title="${escapeHtml(ticket.title)}">#${ticket.id}</button>`;
}
