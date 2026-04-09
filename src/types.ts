export type Id = number;

export type BoardRow = {
  id: Id;
  name: string;
  created_at: string;
  updated_at: string;
};

export type LaneRow = {
  id: Id;
  board_id: Id;
  name: string;
  position: number;
};

export type LabelRow = {
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
  is_completed: number;
  priority: number;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TicketLabelRow = {
  ticket_id: Id;
  label_id: Id;
};

export type TicketBlockerRow = {
  ticket_id: Id;
  blocker_ticket_id: Id;
};

export type CommentRow = {
  id: Id;
  ticket_id: Id;
  body_markdown: string;
  created_at: string;
};

export type LabelView = {
  id: Id;
  boardId: Id;
  name: string;
  color: string;
};

export type TicketBlockerView = {
  id: Id;
  title: string;
  laneId: Id;
  isCompleted: boolean;
  priority: number;
  ref: string;
  shortRef: string;
};

export type TicketRelationView = {
  id: Id;
  title: string;
  laneId: Id;
  isCompleted: boolean;
  priority: number;
  ref: string;
  shortRef: string;
};

export type TicketRelationsView = {
  parent: TicketRelationView | null;
  children: TicketRelationView[];
  blockers: TicketRelationView[];
  blockedBy: TicketRelationView[];
};

export type TicketView = {
  id: Id;
  boardId: Id;
  laneId: Id;
  parentTicketId: Id | null;
  title: string;
  bodyMarkdown: string;
  bodyHtml: string;
  isCompleted: boolean;
  priority: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  labels: LabelView[];
  comments: CommentView[];
  blockerIds: Id[];
  blockers: TicketBlockerView[];
  parent: TicketRelationView | null;
  children: TicketRelationView[];
  ref: string;
  shortRef: string;
};

export type CommentView = {
  id: Id;
  ticketId: Id;
  bodyMarkdown: string;
  bodyHtml: string;
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
  createdAt: string;
  updatedAt: string;
};

export type BoardDetailView = {
  board: BoardView;
  lanes: LaneView[];
  labels: LabelView[];
  tickets: TicketView[];
};

export type BoardExport = {
  board: BoardView;
  lanes: LaneView[];
  labels: LabelView[];
  tickets: Array<Omit<TicketView, "bodyHtml" | "blockers" | "parent" | "children" | "ref" | "shortRef">>;
};
