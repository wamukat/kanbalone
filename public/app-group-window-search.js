// @ts-check
import { t } from "./app-i18n.js";
import { icon } from "./icons.js";

/** @typedef {import("./app-group-types.js").GroupTicketRow} Row */
/** @typedef {import("./app-group-types.js").GroupTicketAnchor} Anchor */
/** @typedef {import("./app-group-types.js").GroupTicketFocus} Focus */

/**
 * @param {{
 *   rows: Row[],
 *   capture: () => Anchor | null,
 *   restore: (anchor: Anchor) => void,
 *   reveal: (id: number, inset: number) => void,
 *   highlight: (id: number | null) => void,
 *   focus: (origin: Focus, reveal: boolean) => boolean,
 *   open: (id: number) => void,
 * }} options
 */
export function createGroupWindowSearch(options) {
  const form = document.createElement("form");
  form.className = "group-window-search";
  form.setAttribute("role", "search");
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = t("Title or #123");
  input.setAttribute("aria-label", t("Find tickets in this view"));
  input.setAttribute("aria-describedby", "group-window-search-help");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "ghost group-text-action";
  submit.textContent = t("Find tickets");
  const previous = button(t("Previous match"), "arrow-up");
  const next = button(t("Next match"), "arrow-down");
  const open = button(t("Open matching ticket"), "chevron-right");
  const clear = button(t("Clear ticket search"), "x");
  const status = document.createElement("output");
  status.className = "muted group-window-search-status";
  status.setAttribute("aria-live", "polite");
  const help = document.createElement("span");
  help.id = "group-window-search-help";
  help.className = "visually-hidden";
  help.textContent = t("Search can find tickets beyond the rows currently shown. Browser Find searches the rows on screen.");
  const actions = document.createElement("div");
  actions.className = "group-window-search-actions";
  actions.append(previous, next, open, clear, status);
  form.append(input, submit, actions, help);

  let rows = options.rows;
  /** @type {Row[]} */ let matches = [];
  let activeIndex = -1;
  /** @type {HTMLElement | null} */ let toolbar = null;
  /** @type {Anchor | null} */ let returnAnchor = null;
  /** @type {Focus | null} */ let returnFocus = null;
  let viewingResults = false;

  /** @param {string} label @param {string} iconName */
  function button(label, iconName) {
    const result = document.createElement("button");
    result.type = "button";
    result.className = "ghost icon-button group-text-action";
    result.title = label;
    result.setAttribute("aria-label", label);
    result.innerHTML = icon(iconName);
    return result;
  }

  /** @param {string} value */
  const normalized = value => value.normalize("NFKC").toLocaleLowerCase();

  function readMatches() {
    const before = matches[activeIndex]?.ticket.id;
    const query = normalized(input.value.trim());
    const id = /^#(\d+)$/.exec(query);
    matches = !query ? [] : rows.filter(row => id
      ? row.ticket.id === Number(id[1])
      : normalized(row.ticket.title).includes(query));
    activeIndex = before === undefined ? -1 : matches.findIndex(({ ticket }) => ticket.id === before);
    options.highlight(viewingResults ? matches[activeIndex]?.ticket.id ?? null : null);
    sync();
  }

  function sync() {
    const hasQuery = input.value.trim() !== "";
    actions.hidden = !hasQuery;
    previous.disabled = !matches.length;
    next.disabled = !matches.length;
    open.disabled = activeIndex < 0 || matches[activeIndex].context;
    toolbar?.classList.toggle("group-window-search-docked", viewingResults);
    status.textContent = !hasQuery ? "" : !matches.length ? t("No matching tickets")
      : activeIndex < 0 ? t("{count} matching tickets", { count: matches.length })
      : t("Match {index} of {count}", { index: activeIndex + 1, count: matches.length });
  }

  /** @param {number} direction */
  function move(direction) {
    if (!input.value.trim()) return;
    if (!viewingResults) {
      returnAnchor = options.capture();
      viewingResults = true;
    }
    if (matches.length) activeIndex = activeIndex < 0 ? (direction > 0 ? 0 : matches.length - 1)
      : (activeIndex + direction + matches.length) % matches.length;
    sync();
    const match = matches[activeIndex];
    if (!match) return;
    options.highlight(match.ticket.id);
    options.reveal(match.ticket.id, toolbar?.getBoundingClientRect().height ?? 0);
  }

  /** @param {boolean} [restoreOrigin] */
  function clearQuery(restoreOrigin = true) {
    const anchor = returnAnchor;
    const origin = returnFocus;
    returnAnchor = null;
    returnFocus = null;
    viewingResults = false;
    input.value = "";
    readMatches();
    if (anchor) options.restore(anchor);
    if (!restoreOrigin || !origin || !options.focus(origin, false)) input.focus({ preventScroll: true });
  }

  form.addEventListener("focusin", event => {
    if (viewingResults || form.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) return;
    const previous = event.relatedTarget;
    if (!(previous instanceof HTMLButtonElement)) return;
    const id = Number(previous.dataset.groupTicket ?? previous.dataset.groupRemove);
    const index = rows.findIndex(({ ticket }) => ticket.id === id);
    if (index >= 0) returnFocus = { id, index, remove: previous.hasAttribute("data-group-remove") };
  });
  form.addEventListener("click", event => event.stopPropagation());
  form.addEventListener("submit", event => {
    event.preventDefault();
    event.stopPropagation();
    move(1);
  });
  form.addEventListener("keydown", event => {
    if (event.key === "Escape" && input.value) {
      event.preventDefault();
      event.stopPropagation();
      clearQuery();
    } else if (event.target === input && ["ArrowUp", "ArrowDown"].includes(event.key) && matches.length) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    }
  });
  input.addEventListener("input", () => {
    if (!input.value.trim() && viewingResults) clearQuery(false);
    else readMatches();
  });
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  clear.addEventListener("click", () => clearQuery());
  open.addEventListener("click", () => {
    const match = matches[activeIndex];
    if (match && !match.context) options.open(match.ticket.id);
  });
  sync();

  return {
    /** @param {HTMLElement | null} nextToolbar */
    attach(nextToolbar) {
      if (toolbar === nextToolbar) return;
      toolbar?.classList.remove("group-window-search-docked");
      toolbar = nextToolbar;
      toolbar?.append(form);
      sync();
    },
    /** @param {Row[]} nextRows */
    update(nextRows) {
      rows = nextRows;
      readMatches();
    },
    dispose() {
      toolbar?.classList.remove("group-window-search-docked");
      form.remove();
    },
  };
}
