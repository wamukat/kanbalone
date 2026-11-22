import { t as tr } from "./app-i18n.js";
import { icon } from "./icons.js";

export function renderListActions(tickets, selectedTicketIds, hasMoveTarget = false) {
  const selectedIds = new Set(selectedTicketIds);
  const selectedTickets = tickets.filter((ticket) => selectedIds.has(ticket.id));
  if (selectedTickets.length === 0) {
    return `<div class="list-actions list-actions-empty"><span>${tr("Select tickets to edit in bulk")}</span></div>`;
  }
  const buttons = [];
  if (hasMoveTarget) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-move-board="true">${icon("columns-3")}<span>${tr("Move")}</span></button>`);
  }
  if (selectedTickets.some((ticket) => !ticket.isArchived)) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-archive="true">${icon("archive")}<span>${tr("Archive")}</span></button>`);
  }
  if (selectedTickets.some((ticket) => ticket.isArchived)) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-archive="false">${icon("rotate-ccw")}<span>${tr("Restore")}</span></button>`);
  }
  buttons.push(`<button type="button" class="list-action-button action-with-icon danger" data-bulk-delete="true">${icon("trash-2")}<span>${tr("Delete")}</span></button>`);
  return `
      <div class="list-actions">
        <span class="list-selection-count">${tr("{count} selected", { count: selectedTickets.length })}</span>
        ${buttons.join("")}
      </div>
    `;
}
