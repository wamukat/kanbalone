import type { BoardDetailView, TicketRelationView, TicketSummaryView, TicketView } from "../types.js";

// API views now use the canonical read model without legacy completion aliases.
export function serializeTicketRelation(relation: TicketRelationView): TicketRelationView {
  return relation;
}

export function serializeTicket(ticket: TicketView): TicketView {
  return ticket;
}

export function serializeTicketSummaries(tickets: TicketSummaryView[]): TicketSummaryView[] {
  return tickets;
}

export function serializeBoardDetail(detail: BoardDetailView): BoardDetailView {
  return detail;
}
