import { renderTag } from "./app-tags.js";
import { renderPriorityIcon } from "./app-priority.js";
import { renderTicketHierarchyIcon } from "./app-ticket-hierarchy.js";
import { renderRemoteRefBadge } from "./app-remote-provider.js";
import { icon } from "./icons.js";

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
          ${renderTicketHierarchyIcon(ticket, state.boardTickets ?? [])}
          ${renderPriorityIcon(ticket.priority)}
        </span>
      </span>
      <button type="button" class="ticket-link">${ctx.escapeHtml(ticket.title)}</button>
      <span class="ticket-status-icons">${renderTicketStatusIcons(ticket)}</span>
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
    for (const lane of laneBoard?.querySelectorAll(".lane.is-drag-over") ?? []) {
      lane.classList.remove("is-drag-over");
    }
  });
  return card;
}

function renderTicketStatusIcons(ticket) {
  return [
    ticket.isResolved
      ? `<span class="ticket-status-icon ticket-status-icon-resolved" title="Resolved" aria-label="Resolved">${icon("check")}</span>`
      : "",
    ticket.isArchived
      ? `<span class="ticket-status-icon ticket-status-icon-archived" title="Archived" aria-label="Archived">${icon("archive")}</span>`
      : "",
  ].join("");
}
