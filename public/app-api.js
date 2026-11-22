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
  if ((init.method ?? "GET").toUpperCase() === "GET" && /^\/api\/boards\/\d+\/tickets$/.test(parsed.pathname) && !parsed.searchParams.has("limit") && !parsed.searchParams.has("cursor")) {
    const result = await collectTicketPages(requestJson, url, { init });
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
  if (revision && payload && typeof payload === "object") {
    Object.defineProperty(payload, "ticketRevision", { value: revision });
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
