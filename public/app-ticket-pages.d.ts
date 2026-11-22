export type TicketPage = {
  tickets: Array<Record<string, unknown>>;
  page: { nextCursor: string | null; total: number };
  readonly ticketRevision?: string;
};
export type FetchPage = (url: string, init?: RequestInit) => Promise<unknown>;
export function readTicketPage(value: unknown): TicketPage;
export function ticketPageUrl(url: string | URL, limit: number, cursor?: string | null, order?: string): string;
export function collectTicketPages(fetchPage: FetchPage, url: string | URL, options?: {
  limit?: number;
  order?: string;
  init?: RequestInit;
  isCurrent?: () => boolean;
}): Promise<TicketPage>;
