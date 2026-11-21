// @ts-check
/** @typedef {{ id: number; parentTicketId: number | null; hasChildren?: boolean }} HierarchyTicket */
import { t as tr } from "./app-i18n.js";
import { icon } from "./icons.js";

/** @param {HierarchyTicket} ticket @param {HierarchyTicket[]} boardTickets */
export function getTicketHierarchyState(ticket, boardTickets) {
  const hasChildren =
    ticket.hasChildren ??
    boardTickets.some((candidate) => candidate.parentTicketId === ticket.id);
  if (ticket.parentTicketId != null) {
    return {
      key: "child",
      iconName: "folder-tree",
      label: tr("Child ticket"),
    };
  }
  if (hasChildren) {
    return {
      key: "parent",
      iconName: "folder-up",
      label: tr("Parent ticket"),
    };
  }
  return {
    key: "single",
    iconName: "ticket",
    label: tr("Standalone ticket"),
  };
}

/** @param {HierarchyTicket} ticket @param {HierarchyTicket[]} boardTickets @param {{selectableParent?: boolean}} [options] */
export function renderTicketHierarchyIcon(ticket, boardTickets, options = {}) {
  const state = getTicketHierarchyState(ticket, boardTickets);
  const className = `ticket-hierarchy-icon ticket-hierarchy-icon-${state.key}`;
  if (options.selectableParent && state.key === "parent") {
    return `<button type="button" class="${className} ticket-hierarchy-select-button" data-select-family-ticket-id="${ticket.id}" title="${tr("Select parent and child tickets")}" aria-label="${tr("Select parent and child tickets")}">${icon(state.iconName)}</button>`;
  }
  return `<span class="${className}" title="${state.label}" aria-label="${state.label}">${icon(state.iconName)}</span>`;
}
