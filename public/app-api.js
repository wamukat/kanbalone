// @ts-check
import { collectTicketPages } from "./app-ticket-pages.js";
import { translateError } from "./app-i18n.js";

/**
 * @param {string | URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<unknown>}
 */
export async function api(url, init = {}) {
  const parsed = new URL(String(url), "http://kanbalone.invalid");
  const relationCandidates = /^\/api\/boards\/\d+\/relation-candidates$/.test(parsed.pathname);
  const ticketList = /^\/api\/boards\/\d+\/tickets$/.test(parsed.pathname);
  if ((init.method ?? "GET").toUpperCase() === "GET" && (ticketList || relationCandidates) && !parsed.searchParams.has("limit") && !parsed.searchParams.has("cursor")) {
    const result = await collectTicketPages(requestJson, url, { init, order: relationCandidates ? "id_asc" : undefined });
    return { tickets: result.tickets };
  }
  return requestJson(url, init);
}

/** @param {string | URL} url @param {RequestInit} [init] @returns {Promise<unknown>} */
async function requestJson(url, init = {}) {
  const headers = {
    ...(init.body == null ? {} : { "content-type": "application/json" }),
    ...(init.headers ?? {}),
  };
  const { headers: _headers, ...fetchInit } = init;
  const response = await fetch(url, {
    ...fetchInit,
    headers,
  });
  if (!response.ok) {
    const payload = /** @type {{ error?: string; code?: string; details?: unknown }} */ (await response.json().catch(() => ({ error: response.statusText })));
    throw Object.assign(new Error(translateError(payload.error ?? response.statusText)), { status: response.status, code: payload.code, details: payload.details });
  }
  if (response.status === 204) {
    return null;
  }
  const payload = await response.json();
  const revision = response.headers.get("X-Kanbalone-Ticket-Revision");
  const pageLimit = Number(response.headers.get("X-Kanbalone-Ticket-Page-Limit"));
  if (payload && typeof payload === "object") {
    if (revision) Object.defineProperty(payload, "ticketRevision", { value: revision });
    if (Number.isSafeInteger(pageLimit) && pageLimit > 0) {
      Object.defineProperty(payload, "ticketPageLimit", { value: pageLimit });
    }
  }
  return payload;
}

/**
 * @param {(url: string | URL, init?: RequestInit) => Promise<unknown>} apiClient
 * @returns {(url: string, options: { method: string; body?: unknown }) => Promise<unknown>}
 */
export function createSendJson(apiClient) {
  return function sendJson(url, { method, body }) {
    return apiClient(url, {
      method,
      body: JSON.stringify(body),
    });
  };
}
