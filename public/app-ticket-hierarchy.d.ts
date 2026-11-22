export type HierarchyTicket = { id: number; parentTicketId: number | null; hasChildren?: boolean };
export function indexTicketHierarchy<T extends HierarchyTicket>(tickets: T[]): {
  byId: Map<number, T>;
  childrenByParent: Map<number, T[]>;
  related(id: number): T[];
  relatedCount(id: number): number;
};
export function getTicketHierarchyState(ticket: HierarchyTicket, boardTickets: HierarchyTicket[]): {
  key: string; iconName: string; label: string;
};
export function renderTicketHierarchyIcon(ticket: HierarchyTicket, boardTickets: HierarchyTicket[], options?: { selectableParent?: boolean; renderIcon?: (name: string) => string }): string;
