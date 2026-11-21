// @ts-check
import { icon } from "./icons.js";

/**
 * @param {{isResolved?: boolean; isArchived: boolean}} ticket
 * @param {{showResolved?: boolean}} [options]
 */
export function renderTicketStatusIcons(ticket, { showResolved = true } = {}) {
  return [
    showResolved && ticket.isResolved
      ? `<span class="ticket-status-icon ticket-status-icon-resolved" title="Resolved" aria-label="Resolved">${icon("check")}</span>`
      : "",
    ticket.isArchived
      ? `<span class="ticket-status-icon ticket-status-icon-archived" title="Archived" aria-label="Archived">${icon("archive")}</span>`
      : "",
  ].join("");
}
