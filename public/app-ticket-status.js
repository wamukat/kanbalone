// @ts-check
import { t as tr } from "./app-i18n.js";
import { icon } from "./icons.js";

/**
 * @param {{isResolved?: boolean; isArchived: boolean}} ticket
 * @param {{showResolved?: boolean, renderIcon?: (name: string) => string}} [options]
 */
export function renderTicketStatusIcons(ticket, { showResolved = true, renderIcon = icon } = {}) {
  return [
    showResolved && ticket.isResolved
      ? `<span class="ticket-status-icon ticket-status-icon-resolved" title="${tr("Resolved")}" aria-label="${tr("Resolved")}">${renderIcon("check")}</span>`
      : "",
    ticket.isArchived
      ? `<span class="ticket-status-icon ticket-status-icon-archived" title="${tr("Archived")}" aria-label="${tr("Archived")}">${renderIcon("archive")}</span>`
      : "",
  ].join("");
}
