// @ts-check
import { t } from "./app-i18n.js";
import policy from "./operation-updater-policy.json" with { type: "json" };

const STORAGE_KEY = "kanbalone:operation-updater";
const invalidCharacters = new RegExp(policy.invalidCharacters, "u");
const routes = Object.entries(policy.routes).map(([route, methods]) => ({
  path: new RegExp(`^${route.replace(/:\w+/gu, "[^/]+")}$`, "u"),
  methods,
}));

/** @param {unknown} value @returns {value is string} */
function isValidUpdater(value) {
  return typeof value === "string" && Boolean(value.trim()) && [...value].length <= policy.maxLength && !invalidCharacters.test(value);
}

function readUpdater() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidUpdater(stored)) return stored;
  } catch {
    // The default is usable with browser storage disabled.
  }
  return policy.defaultBrowserUpdater;
}

/** @param {URL} url @param {RequestInit} init @param {string} origin @returns {RequestInit} */
export function withOperationUpdater(url, init, origin) {
  const method = init.method?.toUpperCase() ?? "GET";
  if (url.origin !== origin || !routes.some(route => route.methods.includes(method) && route.path.test(url.pathname))) return init;
  if (init.body == null) return { ...init, body: JSON.stringify({ updater: readUpdater() }) };
  if (typeof init.body !== "string") return init;
  try {
    const body = JSON.parse(init.body);
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return { ...init, body: JSON.stringify({ ...body, updater: readUpdater() }) };
    }
  } catch {
    // Let the API report an invalid JSON body as usual.
  }
  return init;
}

export function bindOperationUpdaterSettings() {
  const form = document.querySelector("#operation-updater-form");
  const input = document.querySelector("#operation-updater");
  const status = document.querySelector("#operation-updater-status");
  const error = document.querySelector("#operation-updater-error");
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement) || !status || !(error instanceof HTMLElement)) return () => false;

  const hasDraft = () => input.value !== input.defaultValue;
  const refreshInput = () => { input.value = input.defaultValue = readUpdater(); };
  const clearFeedback = () => {
    status.textContent = "";
    error.hidden = true;
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  };
  refreshInput();
  window.addEventListener("storage", event => {
    if ((event.key === STORAGE_KEY || event.key === null) && !hasDraft()) {
      refreshInput();
      clearFeedback();
    }
  });
  input.addEventListener("input", clearFeedback);
  form.addEventListener("submit", event => {
    event.preventDefault();
    clearFeedback();
    const value = input.value;
    if (!isValidUpdater(value)) {
      error.textContent = t("Enter an updater of 1 to 80 valid Unicode characters, with at least one non-whitespace character and no control characters.");
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, value);
      if (localStorage.getItem(STORAGE_KEY) !== value) throw new Error("Updater was not stored");
      input.defaultValue = value;
      status.textContent = t("Saved");
    } catch {
      error.textContent = t("Updater could not be saved. Allow browser storage and try again.");
      error.hidden = false;
    }
  });
  return hasDraft;
}
