import { icon } from "./icons.js";

export function createTicketRelationRenderers(ctx) {
  function formatTicketChoice(ticket) {
    return `#${ticket.id} ${ticket.title}`;
  }

  function matchTicketQuery(ticket, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    const idText = String(ticket.id);
    const hashText = `#${ticket.id}`;
    return idText.includes(normalized) || hashText.includes(normalized) || ticket.title.toLowerCase().includes(normalized);
  }

  function renderTicketSummaryChip(ticket, removeAttr) {
    return `<button type="button" class="ticket-tag-chip ticket-ref-chip" ${removeAttr}="${ticket.id}" title="Remove ${ctx.escapeHtml(formatTicketChoice(ticket))}"><span class="ticket-ref-chip-id">#${ticket.id}</span><span class="ticket-ref-chip-text">${ctx.escapeHtml(ticket.title)}</span>${icon("x")}</button>`;
  }

  function renderTicketOption(ticket, attrName, isSelected) {
    const meta = ticket.isResolved ? '<span class="ticket-picker-meta">Resolved</span>' : "";
    return `
      <button type="button" class="tag-picker-item ${isSelected ? "selected" : ""}" ${attrName}="${ticket.id}" role="option" aria-selected="${isSelected}">
        <span class="ticket-picker-id">#${ticket.id}</span>
        <span class="tag-picker-text">${ctx.escapeHtml(ticket.title)}</span>
        ${meta}
      </button>
    `;
  }

  return {
    matchTicketQuery,
    renderTicketOption,
    renderTicketSummaryChip,
  };
}
