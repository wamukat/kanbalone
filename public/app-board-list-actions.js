import { icon } from "./icons.js";

export function renderListActions(tickets, selectedTicketIds, hasMoveTarget = false) {
  const selectedTickets = tickets.filter((ticket) => selectedTicketIds.includes(ticket.id));
  if (selectedTickets.length === 0) {
    return '<div class="list-actions list-actions-empty"><span>Select tickets to edit in bulk</span></div>';
  }
  const buttons = [];
  if (hasMoveTarget) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-move-board="true">${icon("columns-3")}<span>Move</span></button>`);
  }
  if (selectedTickets.some((ticket) => !ticket.isResolved)) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-resolve="true">${icon("check")}<span>Mark Resolved</span></button>`);
  }
  if (selectedTickets.some((ticket) => ticket.isResolved)) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-resolve="false">${icon("circle")}<span>Reopen</span></button>`);
  }
  if (selectedTickets.some((ticket) => !ticket.isArchived)) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-archive="true">${icon("archive")}<span>Archive</span></button>`);
  }
  if (selectedTickets.some((ticket) => ticket.isArchived)) {
    buttons.push(`<button type="button" class="list-action-button action-with-icon" data-bulk-archive="false">${icon("rotate-ccw")}<span>Restore</span></button>`);
  }
  buttons.push(`<button type="button" class="list-action-button action-with-icon danger" data-bulk-delete="true">${icon("trash-2")}<span>Delete</span></button>`);
  return `
      <div class="list-actions">
        <span class="list-selection-count">${selectedTickets.length} selected</span>
        ${buttons.join("")}
      </div>
    `;
}
