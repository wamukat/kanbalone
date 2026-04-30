import type { BoardDetailView, TicketRelationView, TicketSummaryView, TicketView } from "../types.js";

export type ApiTicketRelationView = TicketRelationView & { isCompleted: boolean };
export type ApiTicketSummaryView = TicketSummaryView & { isCompleted: boolean };
export type ApiTicketView = Omit<TicketView, "parent" | "children" | "blockers" | "blockedBy" | "related"> & {
  isCompleted: boolean;
  parent: ApiTicketRelationView | null;
  children: ApiTicketRelationView[];
  blockers: ApiTicketRelationView[];
  blockedBy: ApiTicketRelationView[];
  related: ApiTicketRelationView[];
};

export function serializeTicketRelation(relation: TicketRelationView): ApiTicketRelationView {
  return { ...relation, isCompleted: relation.isResolved };
}

export function serializeTicketSummary(ticket: TicketSummaryView): ApiTicketSummaryView {
  return { ...ticket, isCompleted: ticket.isResolved };
}

export function serializeTicket(ticket: TicketView): ApiTicketView {
  return {
    ...ticket,
    isCompleted: ticket.isResolved,
    parent: ticket.parent ? serializeTicketRelation(ticket.parent) : null,
    children: ticket.children.map(serializeTicketRelation),
    blockers: ticket.blockers.map(serializeTicketRelation),
    blockedBy: ticket.blockedBy.map(serializeTicketRelation),
    related: ticket.related.map(serializeTicketRelation),
  };
}

export function serializeTicketSummaries(tickets: TicketSummaryView[]): ApiTicketSummaryView[] {
  return tickets.map(serializeTicketSummary);
}

export function serializeBoardDetail(detail: BoardDetailView): Omit<BoardDetailView, "tickets"> & { tickets: ApiTicketView[] } {
  return { ...detail, tickets: detail.tickets.map(serializeTicket) };
}
