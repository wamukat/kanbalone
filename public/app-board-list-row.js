import { renderTag } from "./app-tags.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderRemoteRefBadge } from "./app-remote-provider.js";

export function renderListRow(entry, options) {
  const { ticket, indent } = entry;
  const tags = ticket.tags
    .map((tag) => renderTag(tag, options.escapeHtml))
    .join("");
  const blockedByTickets = options.boardTickets.filter((candidate) => ticket.blockerIds.includes(candidate.id));
  const blockedBy = blockedByTickets.length
    ? `blocked by ${blockedByTickets.map((blocker) => renderInlineTicketLink(blocker, options.escapeHtml)).join(", ")}`
    : "";
  const blocks = options.boardTickets
    .filter((candidate) => candidate.id !== ticket.id && candidate.blockerIds.includes(ticket.id))
    .map((candidate) => renderInlineTicketLink(candidate, options.escapeHtml));
  const parent = ticket.parentTicketId == null
    ? ""
    : options.boardTickets.find((candidate) => candidate.id === ticket.parentTicketId);
  const children = options.boardTickets
    .filter((candidate) => candidate.parentTicketId === ticket.id)
    .map((candidate) => renderInlineTicketLink(candidate, options.escapeHtml));
  const related = options.boardTickets
    .filter((candidate) => ticket.relatedIds?.includes(candidate.id))
    .map((candidate) => renderInlineTicketLink(candidate, options.escapeHtml));
  const relations = [
    parent ? `parent ${renderInlineTicketLink(parent, options.escapeHtml)}` : "",
    children.length ? `children ${children.join(", ")}` : "",
    blockedBy,
    blocks.length ? `blocks ${blocks.join(", ")}` : "",
    related.length ? `related ${related.join(", ")}` : "",
  ].filter(Boolean).join(" · ");
  const lane = options.lanes.find((item) => item.id === ticket.laneId);
  const statusIcons = options.renderTicketStatusIcons(ticket);
  return `
    <div class="list-row ${ticket.isResolved ? "resolved" : ""} ${ticket.isArchived ? "archived" : ""}" style="height:${options.rowHeight}px">
      <input type="checkbox" data-list-ticket-id="${ticket.id}" ${options.selectedTicketIds.includes(ticket.id) ? "checked" : ""} />
      <button type="button" class="list-ticket-link indent-${indent}" data-open-ticket-id="${ticket.id}">
        <span class="ticket-id">#${ticket.id}</span>
        <span class="list-ticket-title">${options.escapeHtml(ticket.title)}</span>
        ${ticket.remote ? renderRemoteRefBadge(ticket.remote, options.escapeHtml, "list-ticket-remote-ref") : ""}
      </button>
      <div class="list-cell muted">${relations || "-"}</div>
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
