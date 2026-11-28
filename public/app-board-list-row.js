import { t as tr } from "./app-i18n.js";
import { renderTag } from "./app-tags.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderRemoteRefBadge } from "./app-remote-provider.js";
import { renderTicketHierarchyIcon } from "./app-ticket-hierarchy.js";
import { renderTicketTaskCount } from "./app-ticket-task-count.js";

export function renderListRow(entry, options) {
  const { ticket, indent } = entry;
  const escape = options.escapeHtml;
  const tags = ticket.tags
    .map((tag) => renderTag(tag, escape, { maxLength: Infinity }))
    .join("");
  const remoteReferences = [
    ticket.remote ? renderRemoteRefBadge(ticket.remote, options.escapeHtml, "list-ticket-remote-ref") : "",
    ...(ticket.externalReferences ?? [])
      .map((reference) => renderRemoteRefBadge(reference, options.escapeHtml, "list-ticket-external-ref")),
  ].filter(Boolean).join("");
  const blockers = renderBlockerReferences(ticket, options);
  const lane = options.lanes.find((item) => item.id === ticket.laneId);
  const statusIcons = options.renderTicketStatusIcons(ticket);
  const taskCount = renderTicketTaskCount(ticket, options.escapeHtml);
  const isSelected = options.selectedTicketIds instanceof Set
    ? options.selectedTicketIds.has(ticket.id) : options.selectedTicketIds.includes(ticket.id);
  const checkbox = escape(tr("Select ticket #{id} {title}", { id: ticket.id, title: ticket.title }));
  const compactLabel = label => `<span class="list-compact-label" aria-hidden="true">${tr(label)}</span>`;
  const title = `<button type="button" class="list-ticket-link" data-open-ticket-id="${ticket.id}">
    <span class="ticket-id">#${ticket.id}</span>
    <span class="list-ticket-title">${options.escapeHtml(ticket.title)}</span>
  </button>`;
  return `
    <div class="list-row ${ticket.isResolved ? "resolved" : ""} ${ticket.isArchived ? "archived" : ""}" role="row" data-list-row-ticket-id="${ticket.id}">
      <div class="list-checkbox-cell" role="cell"><input type="checkbox" data-list-ticket-id="${ticket.id}" aria-label="${checkbox}" ${isSelected ? "checked" : ""} /></div>
      <div class="list-ticket-title-cell indent-${indent}" role="cell">
        ${options.showHierarchy === false ? "" : renderTicketHierarchyIcon(ticket, options.boardTickets, { selectableParent: true })}
        ${taskCount ? `<div class="ticket-title-stack">${title}${taskCount}</div>` : title}
      </div>
      <div class="list-cell muted list-blocker-cell" role="cell">${compactLabel("Blockers")}${blockers}</div>
      <div class="list-tag-cell" role="cell">
        ${compactLabel("Tags")}
        ${tags ? `<div class="tag-list list-tag-row">${tags}</div>` : ""}
        ${remoteReferences ? `<div class="list-remote-ref-row">${remoteReferences}</div>` : ""}
        ${!tags && !remoteReferences ? '<span class="muted">-</span>' : ""}
      </div>
      <div class="list-cell list-priority-cell" role="cell">${compactLabel("Priority")}${renderPriorityBadge(ticket.priority) || '<span class="muted">-</span>'}</div>
      <div class="list-cell muted list-lane-cell" role="cell">${compactLabel("Lane")}${escape(lane?.name || tr("Open"))}</div>
      <div class="list-cell list-status-cell" role="cell">${compactLabel("Status")}${statusIcons || '<span class="muted">-</span>'}</div>
    </div>
  `;
}

function renderBlockerReferences(ticket, { boardTickets, escapeHtml }) {
  if (!ticket.blockerIds.length) return `<span aria-hidden="true">-</span><span class="visually-hidden">${tr("No blockers")}</span>`;
  const references = ticket.blockerReferences ?? boardTickets.filter(candidate => ticket.blockerIds.includes(candidate.id));
  const byId = new Map(references.map(reference => [reference.id, reference]));
  return ticket.blockerIds.map(id => {
    const reference = byId.get(id);
    if (!reference) {
      const unavailable = escapeHtml(tr("Blocker #{id}: status unavailable", { id }));
      return `<span class="list-blocker-unavailable" title="${unavailable}"><span aria-hidden="true">(#${id})</span><span class="visually-hidden">${unavailable}</span></span>`;
    }
    const state = tr(reference.isResolved ? "Resolved" : "Open");
    const status = reference.isArchived ? tr("{state}, {archived}", { state, archived: tr("Archived") }) : state;
    const tooltip = escapeHtml(tr("{title} ({status})", { title: reference.title, status }));
    return `<button type="button" class="ticket-ref-inline list-relation-ticket-link${reference.isResolved ? " ticket-ref-resolved" : ""}" data-open-ticket-id="${id}" title="${tooltip}" aria-label="#${id} ${tooltip}">#${id}</button>`;
  }).join(", ");
}
