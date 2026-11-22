// @ts-check
/** @typedef {{ id: number; parentTicketId: number | null; hasChildren?: boolean }} HierarchyTicket */
import { t as tr } from "./app-i18n.js";
import { icon } from "./icons.js";

/** Build once per collection/render; never retain stale membership across refreshes.
 * @template {HierarchyTicket} T
 * @param {T[]} tickets
 */
export function indexTicketHierarchy(tickets) {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  /** @type {Map<number, T[]>} */
  const childrenByParent = new Map();
  for (const ticket of tickets) {
    if (ticket.parentTicketId == null) continue;
    const children = childrenByParent.get(ticket.parentTicketId) ?? [];
    children.push(ticket);
    childrenByParent.set(ticket.parentTicketId, children);
  }
  /** @param {number} id */
  function related(id) {
    const ticket = byId.get(id);
    if (!ticket) return [];
    const parent = ticket.parentTicketId == null ? ticket : byId.get(ticket.parentTicketId) ?? ticket;
    return [parent, ...(childrenByParent.get(parent.id) ?? [])];
  }
  /** @param {number} id */
  function relatedCount(id) {
    const ticket = byId.get(id);
    if (!ticket) return 0;
    const parent = ticket.parentTicketId == null ? ticket : byId.get(ticket.parentTicketId) ?? ticket;
    return 1 + (childrenByParent.get(parent.id)?.length ?? 0);
  }
  return { byId, childrenByParent, related, relatedCount };
}

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

/** @param {HierarchyTicket} ticket @param {HierarchyTicket[]} boardTickets @param {{selectableParent?: boolean, renderIcon?: (name: string) => string}} [options] */
export function renderTicketHierarchyIcon(ticket, boardTickets, options = {}) {
  const renderIcon = options.renderIcon ?? icon;
  const state = getTicketHierarchyState(ticket, boardTickets);
  const className = `ticket-hierarchy-icon ticket-hierarchy-icon-${state.key}`;
  if (options.selectableParent && state.key === "parent") {
    return `<button type="button" class="${className} ticket-hierarchy-select-button" data-select-family-ticket-id="${ticket.id}" title="${tr("Select parent and child tickets")}" aria-label="${tr("Select parent and child tickets")}">${renderIcon(state.iconName)}</button>`;
  }
  return `<span class="${className}" title="${state.label}" aria-label="${state.label}">${renderIcon(state.iconName)}</span>`;
}
