import type { GroupTicket, GroupSearchState, GroupViewState, GroupViewOptions, GroupTicketWindowModel } from "./app-group-types.js";
export function relatedTickets(id: number, source: GroupTicket[]): GroupTicket[];
export function searchGroupCandidates(state: GroupSearchState): GroupTicket[];
export function renderGroupOptions(state: GroupSearchState, escapeHtml: (value: string) => string): string;
export function renderGroupView(view: GroupViewState, options: GroupViewOptions): string;
export function renderGroupViewSections(view: GroupViewState, options: GroupViewOptions, includeTickets?: boolean | "auto"): {
  list: string; header: string; tickets: string | null; footer: string; ticketWindow: GroupTicketWindowModel | null;
};
