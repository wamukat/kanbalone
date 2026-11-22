import type { GroupTicket, GroupSearchState, GroupViewState, GroupViewOptions } from "./app-group-types.js";
export function relatedTickets(id: number, source: GroupTicket[]): GroupTicket[];
export function searchGroupCandidates(state: GroupSearchState): GroupTicket[];
export function renderGroupOptions(state: GroupSearchState, escapeHtml: (value: string) => string): string;
export function renderGroupView(view: GroupViewState, options: GroupViewOptions): string;
export function renderGroupViewSections(view: GroupViewState, options: GroupViewOptions, includeTickets?: boolean): {
  list: string; header: string; tickets: string | null; footer: string;
};
