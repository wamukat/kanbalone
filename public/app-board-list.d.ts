type ListTicket = {
  id: number;
  priority: number;
  parentTicketId?: number | null;
  hasChildren?: boolean;
};

type ListActionTicket = {
  id: number;
  laneId?: number;
  isResolved?: boolean;
  isArchived?: boolean;
};

type ListTag = {
  name: string;
  color?: string | null;
};

type ListSortKey = "id" | "tags" | "priority";

type ListSort = {
  key: ListSortKey;
  direction: "asc" | "desc";
};

type ListBoardTicket = ListTicket & ListActionTicket & {
  title: string;
  laneId: number;
  blockerIds: number[];
  tags: ListTag[];
};

type ListBoardLane = {
  id: number;
  name: string;
};

type ListBoardDetail = {
  tickets: ListBoardTicket[];
  lanes: ListBoardLane[];
  tags: Array<{ id: number; name: string }>;
};

type ListBoardState = {
  activeBoardId: number | null;
  boardDetail: { lanes: ListBoardLane[] } | null;
  boards: Array<{ id: number; name: string }>;
  boardTickets: import("../src/types.js").ListTicketReferenceView[];
  filters: import("./app-preferences.js").BoardFilters;
  selectedListTicketIds: number[];
};

type ListBoardElements = {
  listBoard: HTMLElement;
  uxFields: HTMLElement;
};

type ListBoardContext = {
  api(path: string, options?: unknown): Promise<unknown>;
  confirmAndRun(options: unknown): Promise<unknown> | unknown;
  elements: ListBoardElements;
  escapeHtml(value: string): string;
  openFormDialog(options: unknown): Promise<unknown>;
  openEditor(ticketId: number | null, mode: "view" | "edit", laneId?: number): void;
  refreshBoardDetail(): Promise<unknown>;
  renderBoardDetail(): void;
  sendJson(path: string, options?: unknown): Promise<unknown>;
  showToast(message: string, tone?: string): void;
  state: ListBoardState;
};

type ListBoardOptions = {
  hasActiveTicketFilters(): boolean;
  renderEmptyState(options: {
    iconName: string;
    title: string;
    body: string;
    actionLabel?: string;
    actionAttr?: string;
    actionIcon?: string;
  }): string;
  renderTicketStatusIcons(ticket: ListBoardTicket): string;
};

export const LIST_ROW_HEIGHT: number;
export const LIST_OVERSCAN: number;

export function getListTicketComparator<T extends ListTicket & { tags?: ListTag[] }>(sort?: ListSort | null): (left: T, right: T) => number;

export function getListTickets<T extends ListTicket & { tags?: ListTag[] }>(tickets: T[], sort?: ListSort | null): Array<{
  ticket: T;
  indent: number;
}>;

export function renderListActions<T extends ListActionTicket>(
  tickets: T[],
  selectedTicketIds: number[],
  hasMoveTarget?: boolean,
  showTotal?: boolean,
): string;

type ListAnchor = { id: number; index: number; offset: number; top: boolean; bottom: boolean };

export function createListBoardModule(ctx: ListBoardContext, options: ListBoardOptions): {
  getOrderedTicketIds(): number[];
  focusTicket(ticketId: number, options?: { scroll?: boolean }): boolean;
  revealTicket(ticketId: number, scroll?: boolean): HTMLElement | null;
  captureAnchor(): ListAnchor | null;
  restoreAnchor(anchor: ListAnchor): void;
  handleListBoardChange(event: Event): void;
  handleListBoardClick(event: Event): void;
  handleListBoardScroll(event: Event): void;
  paintVisibleListRows(): void;
  renderListBoard(detail: ListBoardDetail): void;
  reset(): void;
};
