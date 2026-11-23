import type { GroupTicketView, GroupView } from "../src/types.js";

export type { GroupView };
export type GroupSummary = Omit<GroupView, "descriptionMarkdown" | "descriptionHtml">;
export type GroupSelection = number | "ungrouped" | null;
export type GroupTicket = GroupTicketView;
export type GroupTicketRow = {
  ticket: GroupTicket;
  familyId: number;
  child: boolean;
  context: boolean;
  canRemove: boolean;
  lastInFamily: boolean;
};
export type GroupTicketWindowModel = {
  rows: GroupTicketRow[];
  renderRow(row: GroupTicketRow): string;
};
export type GroupTarget = Pick<GroupView, "id" | "revision">;
export type GroupPreview = {
  expectedToken: string;
  requiresResolution: boolean;
  tickets: Array<{ id: number; title: string; isArchived: boolean }>;
  candidates: Array<{
    group: { id: number; name: string };
    changedTicketIds: number[];
  }>;
};
export type FormDialogOptions = {
  title: string;
  message: string;
  fields: string;
  submitLabel: string;
};
export type GroupContext = {
  state: {
    activeBoardId: number | null;
    viewMode: string;
    boardDetail: { lanes: Array<{ id: number; name: string }> } | null;
  };
  elements: { groupBoard: HTMLElement };
  escapeHtml(value: string): string;
  api(url: string, options?: RequestInit): Promise<unknown>;
  sendJson(
    url: string,
    options: { method: string; body: unknown },
  ): Promise<unknown>;
  closeEditor?(): void;
  openEditor(
    id: number | null,
    mode: string,
    laneId?: number | null,
    group?: { id: number; name: string },
  ): Promise<void>;
  beforeGroupRender?(): void;
  afterGroupRender?(): void;
  saveBoardViewMode?(): void;
  syncViewMode(): void;
  syncBoardUrl(): void;
  refreshBoardDetail(options?: { awaitGroupLoad?: boolean }): Promise<void>;
  openFormDialog(options: FormDialogOptions): Promise<boolean>;
  confirmAndRun(options: {
    title: string;
    message: string;
    warning: string;
    submitLabel: string;
    run(): Promise<void>;
  }): Promise<unknown>;
};
export type GroupConflictContext = {
  elements: {
    uxSubmitButton: HTMLButtonElement;
    uxForm: HTMLFormElement;
    uxFields: HTMLElement;
  };
  escapeHtml(value: string): string;
  openFormDialog(options: FormDialogOptions): Promise<boolean>;
};

export type GroupSearchState = {
  candidates: GroupTicket[];
  chosen: number[];
  query: string;
  activeOption: number;
};
export type GroupViewState = GroupSearchState & {
  groups: GroupSummary[];
  selectedId: GroupSelection;
  selected: GroupView | null;
  ungroupedTicketCount: number;
  tickets: GroupTicket[];
  all: boolean;
  sort: string;
  showArchived: boolean;
  creating: boolean;
  createName: string;
  renaming: boolean;
  renameName: string;
  descriptionEditing: boolean;
  descriptionDraft: string;
  descriptionPreview: string | null;
  expanded: boolean;
  adding: boolean;
  busy: boolean;
  error: string;
};
export type GroupViewOptions = {
  escapeHtml(value: string): string;
  rowIcon?: (name: string) => string;
  lanes: Array<{ id: number; name: string }>;
};
