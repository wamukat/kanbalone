import { t as tr } from "./app-i18n.js";
import { ticketInlineIcon } from "./app-ticket-inline-icons.js";
import { renderTag } from "./app-tags.js";
import { renderPriorityIcon } from "./app-priority.js";
import { renderTicketHierarchyIcon } from "./app-ticket-hierarchy.js";
import { renderRemoteRefBadge } from "./app-remote-provider.js";
import { renderTicketStatusIcons } from "./app-ticket-status.js";

export function createKanbanTicketCard(ctx, ticket) {
  const { state } = ctx;
  const card = document.createElement("article");
  card.className = `ticket-card ${ticket.isResolved ? "resolved" : ""} ${ticket.isArchived ? "archived" : ""}`;
  card.draggable = true;
  card.dataset.ticketId = String(ticket.id);
  card.innerHTML = `
    <div class="ticket-head">
      <span class="ticket-id-stack">
        <span class="ticket-id">#${ticket.id}</span>
        <span class="ticket-card-meta-icons">
          ${renderTicketHierarchyIcon(ticket, state.boardTickets ?? [], { renderIcon: ticketInlineIcon })}
          ${renderPriorityIcon(ticket.priority, ticketInlineIcon)}
          ${renderBlockerIndicator(ticket)}
        </span>
      </span>
      <button type="button" class="ticket-link">${ctx.escapeHtml(ticket.title)}</button>
      <span class="ticket-status-icons">${renderTicketStatusIcons(ticket, { renderIcon: ticketInlineIcon })}</span>
    </div>
    ${ticket.remote ? renderRemoteRefBadge(ticket.remote, ctx.escapeHtml, "ticket-remote-card-ref") : ""}
    ${(ticket.externalReferences ?? []).map((reference) => renderRemoteRefBadge(reference, ctx.escapeHtml, "ticket-external-card-ref")).join("")}
    <div class="tag-list">
      ${ticket.tags.map((tag) => renderTag(tag, ctx.escapeHtml)).join("")}
    </div>
  `;

  const titleButton = card.querySelector(".ticket-link");
  titleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    ctx.openEditor(ticket.id, "view");
  });
  card.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    state.activeLaneDragId = null;
    card.closest(".lane-board")?.classList.remove("is-dragging-lane");
    card.classList.add("dragging");
    card.closest(".lane-board")?.classList.add("is-dragging-ticket");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-kanbalone-ticket", String(ticket.id));
      event.dataTransfer.setData("text/plain", `ticket:${ticket.id}`);
      const box = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(card, event.clientX - box.left, event.clientY - box.top);
    }
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    const laneBoard = card.closest(".lane-board");
    laneBoard?.classList.remove("is-dragging-ticket");
    for (const target of laneBoard?.querySelectorAll(".is-ticket-drop-before, .is-ticket-drop-after") ?? []) {
      target.classList.remove("is-ticket-drop-before", "is-ticket-drop-after");
    }
    for (const lane of laneBoard?.querySelectorAll(".lane.is-drag-over") ?? []) {
      lane.classList.remove("is-drag-over");
    }
  });
  return card;
}

function renderBlockerIndicator(ticket) {
  const count = ticket.unresolvedBlockerCount ?? 0;
  if (!count) return "";
  const label = tr(count === 1 ? "Blocked by {count} unresolved ticket" : "Blocked by {count} unresolved tickets", { count });
  return `<span class="ticket-blocker-indicator" title="${label}" aria-label="${label}">${ticketInlineIcon("octagon-alert")}<span>${count}</span></span>`;
}
