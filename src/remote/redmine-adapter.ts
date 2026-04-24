import type { TicketRemoteLinkView } from "../types.js";
import type { RemoteCommentPushResult, RemoteIssueAdapter, RemoteIssueLookup, RemoteIssueSnapshot } from "./adapters.js";
import { EnvRemoteCredentialResolver, type RemoteCredentialResolver } from "./credentials.js";

type RedmineIssueResponse = {
  issue: {
    id: number;
    subject: string;
    description?: string | null;
    status?: {
      name?: string;
    };
    updated_on?: string | null;
    project?: {
      id: number;
      name?: string;
    };
    journals?: Array<{
      id: number;
      notes?: string | null;
      created_on?: string | null;
    }>;
  };
};

export class RedmineIssueAdapter implements RemoteIssueAdapter {
  readonly provider = "redmine";

  constructor(private readonly credentialResolver: RemoteCredentialResolver = new EnvRemoteCredentialResolver()) {}

  async fetchIssue(input: RemoteIssueLookup): Promise<RemoteIssueSnapshot> {
    const parsed = parseRedmineLookup(input);
    const issue = await this.fetchIssueJson(parsed.instanceUrl, parsed.issueKey);
    return mapRedmineIssue(parsed.instanceUrl, issue);
  }

  refreshIssue(link: TicketRemoteLinkView): Promise<RemoteIssueSnapshot> {
    return this.fetchIssue({
      provider: this.provider,
      instanceUrl: link.instanceUrl,
      issueKey: link.issueKey,
    });
  }

  async postComment(link: TicketRemoteLinkView, bodyMarkdown: string): Promise<RemoteCommentPushResult> {
    await this.fetchJson<void>(
      `${normalizeRedmineApiBase(link.instanceUrl)}/issues/${encodeURIComponent(link.issueKey)}.json`,
      link.instanceUrl,
      {
        method: "PUT",
        body: JSON.stringify({
          issue: {
            notes: bodyMarkdown,
          },
        }),
      },
    );
    const issue = await this.fetchIssueJson(link.instanceUrl, link.issueKey, { includeJournals: true });
    const matchingJournal = [...(issue.journals ?? [])]
      .filter((journal) => typeof journal.notes === "string" && journal.notes.trim() === bodyMarkdown.trim())
      .sort((left, right) => Date.parse(right.created_on ?? "") - Date.parse(left.created_on ?? ""))[0];
    if (!matchingJournal?.created_on) {
      throw new Error("Redmine comment push succeeded but journal entry could not be resolved");
    }
    return {
      remoteCommentId: String(matchingJournal.id),
      pushedAt: matchingJournal.created_on,
    };
  }

  private async fetchIssueJson(instanceUrl: string, issueKey: string, options: { includeJournals?: boolean } = {}) {
    const query = options.includeJournals ? "?include=journals" : "";
    const response = await this.fetchJson<RedmineIssueResponse>(
      `${normalizeRedmineApiBase(instanceUrl)}/issues/${encodeURIComponent(issueKey)}.json${query}`,
      instanceUrl,
    );
    return response.issue;
  }

  private async fetchJson<T>(url: string, instanceUrl: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const credential = await this.credentialResolver.getCredential({ provider: this.provider, instanceUrl });
    if (credential?.type === "token") {
      headers.set("x-redmine-api-key", credential.token);
    }
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Redmine request failed: ${response.status} ${text}`.trim());
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }
}

function parseRedmineLookup(input: RemoteIssueLookup): { instanceUrl: string; issueKey: string } {
  if (input.url) {
    const url = new URL(input.url);
    const match = url.pathname.match(/^(?<basePath>.*)\/issues\/(?<issueKey>[^/.]+)(?:\.[a-z0-9]+)?\/?$/i);
    const basePath = match?.groups?.basePath ?? "";
    const issueKey = match?.groups?.issueKey;
    if (!issueKey) {
      throw new Error("Invalid Redmine issue URL");
    }
    return {
      instanceUrl: joinOriginAndPath(url.origin, basePath),
      issueKey,
    };
  }
  if (!input.issueKey) {
    throw new Error("Redmine issue lookup requires issueKey");
  }
  if (!input.instanceUrl) {
    throw new Error("Redmine issue lookup requires instanceUrl when URL is omitted");
  }
  return {
    instanceUrl: input.instanceUrl,
    issueKey: input.issueKey,
  };
}

function normalizeRedmineApiBase(instanceUrl: string): string {
  return joinOriginAndPath(new URL(instanceUrl).origin, new URL(instanceUrl).pathname);
}

function mapRedmineIssue(instanceUrl: string, issue: RedmineIssueResponse["issue"]): RemoteIssueSnapshot {
  const issueKey = String(issue.id);
  const projectName = issue.project?.name?.trim();
  return {
    provider: "redmine",
    instanceUrl,
    resourceType: "issue",
    projectKey: String(issue.project?.id ?? "0"),
    issueKey,
    displayRef: projectName ? `${projectName} #${issueKey}` : `#${issueKey}`,
    url: `${normalizeRedmineApiBase(instanceUrl)}/issues/${issueKey}`,
    title: issue.subject,
    bodyMarkdown: issue.description ?? "",
    state: issue.status?.name ?? null,
    updatedAt: issue.updated_on ?? null,
  };
}

function joinOriginAndPath(origin: string, pathname: string): string {
  const normalizedPath = pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  return `${origin}${normalizedPath}`;
}
