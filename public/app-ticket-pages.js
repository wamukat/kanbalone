// @ts-check
import { translateError } from "./app-i18n.js";
/** @typedef {{tickets: Array<Record<string, unknown>>, page: {nextCursor: string | null, total: number}, ticketRevision?: string}} TicketPage */
/** @typedef {(url: string, init?: RequestInit) => Promise<unknown>} FetchPage */

/** @param {unknown} value @returns {TicketPage} */
export function readTicketPage(value) {
  const page = /** @type {TicketPage} */ (value);
  if (!page || !Array.isArray(page.tickets) || !page.page ||
      !Number.isSafeInteger(page.page.total) || page.page.total < 0 ||
      !(page.page.nextCursor === null || typeof page.page.nextCursor === "string") ||
      page.page.nextCursor === "") throw new Error(translateError("Invalid ticket page response"));
  return page;
}

/** @param {string | URL} url @param {number} limit @param {string | null} cursor @param {string} order */
export function ticketPageUrl(url, limit, cursor = null, order = "position_asc") {
  const parsed = new URL(String(url), "http://kanbalone.invalid");
  parsed.searchParams.set("limit", String(limit));
  if (!parsed.searchParams.has("order")) parsed.searchParams.set("order", order);
  if (cursor) parsed.searchParams.set("cursor", cursor);
  else parsed.searchParams.delete("cursor");
  return /^https?:/.test(String(url)) ? parsed.href : parsed.pathname + parsed.search;
}

/**
 * Stage a complete collection before exposing it. A 409 discards every staged row.
 * @param {FetchPage} fetchPage
 * @param {string | URL} url
 * @param {{limit?: number, order?: string, init?: RequestInit, isCurrent?: () => boolean}} [options]
 * @returns {Promise<TicketPage>}
 */
export async function collectTicketPages(fetchPage, url, options = {}) {
  const wanted = options.limit ?? Infinity;
  const isCurrent = options.isCurrent ?? (() => true);
  function checkCurrent() {
    if (!isCurrent() || options.init?.signal?.aborted) throw new DOMException("Request superseded", "AbortError");
  }
  for (let attempt = 0; ; attempt += 1) {
    /** @type {Array<Record<string, unknown>>} */ const tickets = [];
    /** @type {string | null} */ let cursor = null;
    const seen = new Set();
    let total = -1;
    /** @type {string | undefined} */ let revision;
    try {
      do {
        checkCurrent();
        const count = Math.min(200, wanted - tickets.length);
        const page = readTicketPage(await fetchPage(ticketPageUrl(url, count, cursor, options.order), options.init));
        checkCurrent();
        if (total !== -1 && revision !== page.ticketRevision) throw Object.assign(new Error(translateError("ticket list changed; restart pagination")), { status: 409 });
        revision = page.ticketRevision;
        if (total !== -1 && total !== page.page.total) throw new Error(translateError("Ticket page total changed without invalidation"));
        total = page.page.total;
        if (page.tickets.length > count || (page.page.nextCursor && page.tickets.length === 0)) throw new Error(translateError("Invalid ticket page response"));
        tickets.push(...page.tickets);
        cursor = page.page.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error(translateError("Repeated ticket page cursor"));
        if (cursor) seen.add(cursor);
      } while (cursor && tickets.length < wanted);
      if (tickets.length > total || (!cursor && tickets.length !== total)) throw new Error(translateError("Incomplete ticket page response"));
      const result = { tickets, page: { nextCursor: cursor, total } };
      if (revision) Object.defineProperty(result, "ticketRevision", { value: revision });
      return result;
    } catch (error) {
      checkCurrent();
      if (/** @type {{status?: number}} */ (error)?.status !== 409 || attempt >= 2) throw error;
    }
  }
}
