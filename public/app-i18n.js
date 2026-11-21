// @ts-check
import errors from "./locales/ja-errors.js";
import common from "./locales/ja-common.js";
import board from "./locales/ja-board.js";
import editor from "./locales/ja-editor.js";

export const LANGUAGE_STORAGE_KEY = "kanbalone:language";
/** @type {Record<string, string>} */
const japanese = { ...board, ...editor, ...common, ...errors };
/** @typedef {"en" | "ja"} Locale */

/** @returns {Locale} */
function readLocale() {
  // A temporary selection takes priority if persistent storage was unavailable.
  for (const storageName of /** @type {const} */ (["sessionStorage", "localStorage"])) {
    try {
      const selected = globalThis[storageName]?.getItem(LANGUAGE_STORAGE_KEY);
      if (selected === "ja" || selected === "en") return selected;
    } catch { /* Browser privacy settings may disable storage. */ }
  }
  return /^ja(?:-|$)/i.test(globalThis.navigator?.language ?? "en") ? "ja" : "en";
}
const locale = readLocale();
/** @returns {Locale} */
export function getLocale() { return locale; }

/** Save before reloading so that a failed save never discards the current screen.
 * @param {Locale} selected
 * @returns {boolean}
 */
export function saveLocale(selected) {
  if (selected !== "en" && selected !== "ja") return false;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, selected);
    try { sessionStorage.removeItem(LANGUAGE_STORAGE_KEY); } catch { /* optional */ }
    return true;
  } catch {
    try {
      sessionStorage.setItem(LANGUAGE_STORAGE_KEY, selected);
      return true;
    } catch { return false; }
  }
}

/** Translate application text, then interpolate plain values. Escape at HTML sinks.
 * @param {string} source
 * @param {Record<string, string | number>} [values]
 */
export function t(source, values = {}) {
  const template = locale === "ja" && Object.hasOwn(japanese, source) ? japanese[source] : source;
  return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

/** Translate explicitly marked static HTML once, before application rendering.
 * Dynamic content is translated by its renderer, never by scanning user content.
 */
export function initializeLanguage() {
  document.documentElement.lang = locale;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.getAttribute("data-i18n") ?? "");
  });
  for (const attribute of ["title", "aria-label", "placeholder"]) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`) ?? ""));
    });
  }
}

/** API messages remain unchanged on the wire; only known application errors are localized.
 * @param {string} message
 */
export function translateError(message) {
  if (locale !== "ja") return message;
  const key = Object.keys(errors).find((key) => key.toLowerCase() === message.toLowerCase());
  return key ? t(key) : message;
}
