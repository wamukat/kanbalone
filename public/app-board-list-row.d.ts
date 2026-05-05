type ListRowTag = {
  name: string;
  color?: string | null;
};

type ListRowRemoteReference = {
  provider: string;
  displayRef: string;
  url: string;
};

type ListRowTicket = {
  id: number;
  laneId: number;
  parentTicketId?: number | null;
  hasChildren?: boolean;
  title: string;
  blockerIds: number[];
  relatedIds: number[];
  tags: ListRowTag[];
  remote?: ListRowRemoteReference | null;
  externalReferences?: ListRowRemoteReference[];
  priority: number;
  isResolved: boolean;
  isArchived: boolean;
};

export function renderListRow(
  entry: {
    ticket: ListRowTicket;
    indent: number;
  },
  options: {
    boardTickets: ListRowTicket[];
    escapeHtml(value: string): string;
    lanes: Array<{ id: number; name: string }>;
    renderTicketStatusIcons(ticket: ListRowTicket): string;
    rowHeight: number;
    selectedTicketIds: number[];
  },
): string;
