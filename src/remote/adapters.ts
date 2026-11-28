import type { TicketRemoteLinkView, TicketExternalReferenceView } from "../types.js";

export type RemoteIssueSnapshot = {
  provider: string;
  instanceUrl: string;
  resourceType: string;
  projectKey: string;
  issueKey: string;
  displayRef: string;
  url: string;
  title: string;
  bodyMarkdown: string;
  state: string | null;
  updatedAt: string | null;
};

export type RemoteIssueLookup = {
  provider: string;
  instanceUrl?: string;
  projectKey?: string;
  issueKey?: string;
  url?: string;
};

export type RemoteCommentPushResult = {
  remoteCommentId: string;
  pushedAt: string;
};

export type ChangeRequestSnapshot = { state: "open" | "closed" | "merged"; isDraft: boolean };

export interface RemoteIssueAdapter {
  fetchChangeRequest?(reference: TicketExternalReferenceView): Promise<ChangeRequestSnapshot>;
  readonly provider: string;
  fetchIssue(input: RemoteIssueLookup): Promise<RemoteIssueSnapshot>;
  refreshIssue(link: TicketRemoteLinkView): Promise<RemoteIssueSnapshot>;
  postComment(link: TicketRemoteLinkView, bodyMarkdown: string): Promise<RemoteCommentPushResult>;
}

export type RemoteAdapterRegistry = Record<string, RemoteIssueAdapter>;
