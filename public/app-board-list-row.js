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
    ? `blocked by ${blockedByTickets
        .map(
          (blocker) =>
            `<span class="ticket-ref-inline${blocker.isResolved ? " ticket-ref-resolved" : ""}">#${blocker.id}</span>`,
        )
        .join(", ")}`
    : "";
  const blocks = options.boardTickets
    .filter((candidate) => candidate.id !== ticket.id && candidate.blockerIds.includes(ticket.id))
    .map(
      (candidate) =>
        `<span class="ticket-ref-inline${candidate.isResolved ? " ticket-ref-resolved" : ""}">#${candidate.id}</span>`,
    );
  const relations = [
    blockedBy,
    blocks.length ? `blocks ${blocks.join(", ")}` : "",
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
