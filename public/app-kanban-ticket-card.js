import { renderTag } from "./app-tags.js";
import { icon } from "./icons.js";

export function createKanbanTicketCard(ctx, ticket) {
  const card = document.createElement("article");
  card.className = `ticket-card ${ticket.isResolved ? "resolved" : ""} ${ticket.isArchived ? "archived" : ""}`;
  card.draggable = true;
  card.dataset.ticketId = String(ticket.id);
  card.innerHTML = `
    <div class="ticket-head">
      <span class="ticket-id">#${ticket.id}</span>
      <button type="button" class="ticket-link">${ctx.escapeHtml(ticket.title)}</button>
      <span class="ticket-status-icons">${renderTicketStatusIcons(ticket)}</span>
    </div>
    <div class="tag-list">
      ${ticket.tags.map((tag) => renderTag(tag, ctx.escapeHtml)).join("")}
    </div>
  `;

  const titleButton = card.querySelector(".ticket-link");
  titleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    ctx.openEditor(ticket.id, "view");
  });
  card.addEventListener("dragstart", () => {
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
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
