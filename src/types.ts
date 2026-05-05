export type Id = number;

export type BoardRow = {
  id: Id;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type LaneRow = {
  id: Id;
  board_id: Id;
  name: string;
  position: number;
};

export type TagRow = {
  id: Id;
  board_id: Id;
  name: string;
  color: string;
};

export type TicketRow = {
  id: Id;
  board_id: Id;
  lane_id: Id;
  parent_ticket_id: Id | null;
  title: string;
  body_markdown: string;
  is_resolved: number;
  is_archived: number;
  priority: number;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TicketTagRow = {
  ticket_id: Id;
  tag_id: Id;
};

export type TicketTagReasonRow = {
  ticket_id: Id;
  tag_id: Id;
  reason: string | null;
  details_json: string | null;
  reason_comment_id: Id | null;
  attached_at: string | null;
  updated_at: string | null;
};

export type TicketBlockerRow = {
  ticket_id: Id;
  blocker_ticket_id: Id;
};

export type TicketRelatedLinkRow = {
  ticket_id: Id;
  related_ticket_id: Id;
};

export type CommentRow = {
  id: Id;
  ticket_id: Id;
  body_markdown: string;
  created_at: string;
};

export type TicketRemoteLinkRow = {
  ticket_id: Id;
  provider: string;
  instance_url: string;
  resource_type: string;
  project_key: string;
  issue_key: string;
  display_ref: string;
  remote_url: string;
  remote_title: string;
  remote_body_markdown: string;
  remote_state: string | null;
  remote_updated_at: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export type TicketExternalReferenceRow = {
  id: Id;
  ticket_id: Id;
  kind: string;
  provider: string;
  instance_url: string;
  resource_type: string;
  project_key: string;
  issue_key: string;
  display_ref: string;
  remote_url: string;
  remote_title: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentRemoteSyncRow = {
  comment_id: Id;
  status: CommentRemoteSyncStatus;
  remote_comment_id: string | null;
  pushed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentRemoteSyncStatus = "local_only" | "pushing" | "pushed" | "push_failed";

export type ActivityLogRow = {
  id: Id;
  board_id: Id;
  ticket_id: Id | null;
  subject_ticket_id: Id;
  action: string;
  message: string;
  details_json: string;
  created_at: string;
};

export type TicketEventRow = {
  id: Id;
  ticket_id: Id;
  source: string;
  kind: string;
  title: string;
  summary: string | null;
  severity: string | null;
  icon: string | null;
  data_json: string;
  created_at: string;
};

export type TagView = {
  id: Id;
  boardId: Id;
  name: string;
  color: string;
};

export type TicketTagReasonView = {
  tag: TagView;
  reason: string | null;
  details: Record<string, unknown> | null;
  reasonCommentId: Id | null;
  attachedAt: string | null;
  updatedAt: string | null;
};

export type TicketBlockerView = {
  id: Id;
  title: string;
  laneId: Id;
  isResolved: boolean;
  priority: number;
  ref: string;
  shortRef: string;
};

export type TicketRelationView = {
  id: Id;
  title: string;
  laneId: Id;
  isResolved: boolean;
  priority: number;
  ref: string;
  shortRef: string;
};

export type TicketRelationsView = {
  parent: TicketRelationView | null;
  children: TicketRelationView[];
  blockers: TicketRelationView[];
  blockedBy: TicketRelationView[];
  related: TicketRelationView[];
};

export type TicketView = {
  id: Id;
  boardId: Id;
  laneId: Id;
  parentTicketId: Id | null;
  hasChildren: boolean;
  title: string;
  bodyMarkdown: string;
  bodyHtml: string;
  isResolved: boolean;
  isArchived: boolean;
  priority: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  tags: TagView[];
  comments: CommentView[];
  blockerIds: Id[];
  relatedIds: Id[];
  blockers: TicketBlockerView[];
  blockedBy: TicketRelationView[];
  related: TicketRelationView[];
  parent: TicketRelationView | null;
  children: TicketRelationView[];
  ref: string;
  shortRef: string;
  remote: TicketRemoteLinkView | null;
  externalReferences: TicketExternalReferenceView[];
};

export type TicketSummaryView = {
  id: Id;
  boardId: Id;
  laneId: Id;
  parentTicketId: Id | null;
  hasChildren: boolean;
  title: string;
  isResolved: boolean;
  isArchived: boolean;
  priority: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  tags: TagView[];
  blockerIds: Id[];
  relatedIds: Id[];
  ref: string;
  shortRef: string;
  remote: Pick<TicketRemoteLinkView, "provider" | "displayRef" | "url"> | null;
  externalReferences: TicketExternalReferenceView[];
};

export type CommentView = {
  id: Id;
  ticketId: Id;
  bodyMarkdown: string;
  bodyHtml: string;
  createdAt: string;
  sync: CommentRemoteSyncView;
};

export type TicketRemoteLinkView = {
  ticketId: Id;
  provider: string;
  instanceUrl: string;
  resourceType: string;
  projectKey: string;
  issueKey: string;
  displayRef: string;
  url: string;
  title: string;
  bodyMarkdown: string;
  bodyHtml: string;
  state: string | null;
  remoteUpdatedAt: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketExternalReferenceView = {
  id: Id;
  ticketId: Id;
  kind: string;
  provider: string;
  instanceUrl: string;
  resourceType: string;
  projectKey: string;
  issueKey: string;
  displayRef: string;
  url: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommentRemoteSyncView = {
  commentId: Id;
  status: CommentRemoteSyncStatus;
  remoteCommentId: string | null;
  pushedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityLogView = {
  id: Id;
  boardId: Id;
  ticketId: Id | null;
  subjectTicketId: Id;
  action: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type TicketEventView = {
  id: Id;
  ticketId: Id;
  source: string;
  kind: string;
  title: string;
  summary: string | null;
  severity: string | null;
  icon: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};

export type LaneView = {
  id: Id;
  boardId: Id;
  name: string;
  position: number;
};

export type BoardView = {
  id: Id;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardDetailView = {
  board: BoardView;
  lanes: LaneView[];
  tags: TagView[];
  tickets: TicketView[];
};

export type BoardShellView = {
  board: BoardView;
  lanes: LaneView[];
  tags: TagView[];
};

export type BoardExport = {
  board: BoardView;
  lanes: LaneView[];
  tags: TagView[];
  tickets: Array<
    Omit<TicketView, "bodyHtml" | "blockers" | "blockedBy" | "related" | "parent" | "children" | "ref" | "shortRef" | "remote" | "externalReferences" | "comments"> & {
      comments: Array<Omit<CommentView, "sync">>;
      isCompleted?: boolean;
    }
  >;
};
