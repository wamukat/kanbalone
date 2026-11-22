// @ts-check
import { collectTicketPages } from "./app-ticket-pages.js";
import { t } from "./app-i18n.js";

/** @typedef {import("./app-ticket-pages.js").FetchPage} FetchPage */
/** @typedef {{isCurrent: () => boolean, signal?: AbortSignal}} LoadOptions */
function changed() {
  return Object.assign(new Error(t("ticket list changed; restart pagination")), { status: 409 });
}

/**
 * Keep independently queried lanes on the same board revision before rendering.
 * @param {FetchPage} api
 * @param {Array<{id: number, isCompletionLane?: boolean}>} lanes
 * @param {string} url
 * @param {LoadOptions & {limits: Map<number, number>}} options
 */
export async function loadKanbanTicketCollections(api, lanes, url, options) {
  for (let attempt = 0; ; attempt += 1) {
    const collections = await Promise.all(lanes.map(async (lane) => {
      const parsed = new URL(url, "http://kanbalone.invalid");
      parsed.searchParams.set("lane_id", String(lane.id));
      if (lane.isCompletionLane) parsed.searchParams.set("order", "completed_desc");
      const laneUrl = parsed.pathname + parsed.search;
      const result = await collectTicketPages(api, laneUrl, {
        limit: lane.isCompletionLane ? options.limits.get(lane.id) ?? 5 : Infinity,
        isCurrent: options.isCurrent, init: { signal: options.signal },
      });
      return { lane, url: laneUrl, ...result, ticketRevision: result.ticketRevision };
    }));
    if (new Set(collections.map((item) => item.ticketRevision)).size > 1) {
      if (attempt < 2 && options.isCurrent()) continue;
      throw changed();
    }
    return {
      tickets: collections.flatMap((item) => item.tickets),
      completionPages: Object.fromEntries(collections.filter((item) => item.lane.isCompletionLane)
        .map((item) => [item.lane.id, { url: item.url, ...item.page, tickets: item.tickets }])),
    };
  }
}

/**
 * Priority used to filter only visible rows. Keep the complete priority-independent
 * reference set for blocker labels and selecting a parent's children.
 * A board refreshed with its editor open uses references across every filter.
 * @param {FetchPage} api @param {string} url @param {LoadOptions & { allReferences?: () => boolean }} options
 */
export async function loadListTicketCollection(api, url, options) {
  const referenceUrl = new URL(url, "http://kanbalone.invalid");
  const priority = referenceUrl.searchParams.get("priority");
  const selected = new Set(priority?.split(","));
  referenceUrl.searchParams.delete("priority");
  const needsReferences = priority !== null && !["1", "2", "3", "4"].every(value => selected.has(value));
  referenceUrl.pathname = referenceUrl.pathname.replace(/\/tickets$/, "/list-ticket-references");
  for (let attempt = 0; ; attempt += 1) {
    const [display, filteredReferences] = await Promise.all([
      collectTicketPages(api, url, { isCurrent: options.isCurrent, init: { signal: options.signal } }),
      needsReferences ? collectTicketPages(api, referenceUrl.pathname + referenceUrl.search, { isCurrent: options.isCurrent, init: { signal: options.signal } }) : null,
    ]);
    if (filteredReferences && display.ticketRevision !== filteredReferences.ticketRevision) {
      if (attempt < 2 && options.isCurrent()) continue;
      throw changed();
    }
    // The dialog can open or close while the visible collection is loading.
    const references = options.allReferences?.() && referenceUrl.search !== "?archived=all"
      ? await collectTicketPages(api, referenceUrl.pathname + "?archived=all", {
        isCurrent: options.isCurrent, init: { signal: options.signal },
      })
      : filteredReferences;
    if (references !== filteredReferences && display.ticketRevision !== references?.ticketRevision) {
      if (attempt < 2 && options.isCurrent()) continue;
      throw changed();
    }
    return { ...display, referenceTickets: references?.tickets ?? display.tickets };
  }
}
