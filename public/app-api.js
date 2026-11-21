// @ts-check
import { translateError } from "./app-i18n.js";

/**
 * @param {string | URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<unknown>}
 */
export async function api(url, init = {}) {
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
  return response.json();
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
