import { t } from "./app-i18n.js";
import { createViewSettings, definitionOf, emptyDefinition } from "./app-custom-view-settings.js";
import { renderCustomView } from "./app-custom-view-list.js";
import { PAGE_SIZE, readViewPage } from "./app-custom-view-pages.js";

export function createCustomViews(ctx) {
  const { api, sendJson, escapeHtml: esc, elements, state } = ctx;
  const panel = document.querySelector("#custom-view-panel");
  const links = document.querySelector("#custom-view-links");
  const newButton = document.querySelector("#new-custom-view-button");
  const backButton = document.querySelector("#return-custom-view");
  const base = "/api/custom-views";
  const query = body => sendJson(`${base}/query`, { method: "POST", body });
  const report = error => ctx.showToast(error.message, "error");
  const showError = error => {
    const node = panel.querySelector(".cv-error");
    if (!node) return report(error);
    node.hidden = false;
    node.textContent = error.status === 409 ? t("This view changed. Cancel and reopen it to use the latest settings.") : error.message;
  };

  let active = false;
  let id = null;
  let saved = null;
  let catalog = [];
  let page = null;
  let display = null;
  let displayVersion = null;
  let settings = null;
  let initialForm = "";
  let index = 0;
  let cursors = [null];
  let cursorDefinition;
  let opening = 0;
  let session = 0;
  let request = 0;
  let previewRequest = 0;
  let previewTimer;
  let saving = false;
  let origin = null;
  let source;
  let timer;
  let refreshing = false;
  let restoring = null;
  let refreshAgain = false;
  let sidebarVersion = 0;
  let summaries = [];
  let lastLinks;

  const appearanceOf = v => ({ showBody: v.showBody, showLatestComment: v.showLatestComment });
  const currentPath = () => id ? `/views/${id}` : "/views/new";
  const isDirty = () => Boolean(settings && JSON.stringify(settings.readDefinition()) !== initialForm);

  function setPath(path, replace = false, data = null) {
    if (location.pathname !== path) history[replace ? "replaceState" : "pushState"](data, "", path);
  }

  function updateLinks() {
    const markup = summaries.map(view => `<a class="cv-nav-link" data-custom-view-id="${view.id}" href="/views/${view.id}" ${active && view.id === id ? 'aria-current="page"' : ""}>${esc(view.name)}</a>`).join("");
    if (markup !== lastLinks) {
      lastLinks = markup;
      const focused = links.contains(document.activeElement) ? document.activeElement.dataset.customViewId : null;
      links.innerHTML = markup;
      if (focused) (links.querySelector(`[data-custom-view-id="${focused}"]`) ?? newButton).focus({ preventScroll: true });
    }
  }

  async function loadLinks() {
    const version = ++sidebarVersion;
    const result = await api(base);
    if (version !== sidebarVersion) return;
    summaries = result.views;
    updateLinks();
  }

  function focusKey() {
    const target = document.activeElement;
    if (!panel.contains(target)) return null;
    for (const attr of ["data-view-ticket", "data-view-action", "data-view-appearance", "data-view-expand"]) {
      if (target.hasAttribute(attr)) {
        const row = target.dataset.rowId;
        return `[${attr}="${CSS.escape(target.getAttribute(attr))}"]${row ? `[data-row-id="${row}"]` : ""}`;
      }
    }
    return target.id === "custom-view-heading" ? "#custom-view-heading" : null;
  }

  function paint() {
    if (!active || !saved || !page || settings) return;
    const key = focusKey();
    const scroll = panel.scrollTop;
    const expanded = [...panel.querySelectorAll('[data-view-expand][aria-expanded="true"]')].map(button => ({
      field: button.dataset.viewExpand, ticketId: button.dataset.rowId, commentId: button.dataset.commentId,
    }));
    panel.innerHTML = renderCustomView({ view: saved, display, page, catalog, pageIndex: index, pageSize: PAGE_SIZE, esc });
    if (key) (panel.querySelector(key) ?? panel.querySelector("#custom-view-heading")).focus({ preventScroll: true });
    panel.scrollTop = scroll;
    for (const { field, ticketId, commentId } of expanded) {
      const button = panel.querySelector(`[data-view-expand="${field}"][data-row-id="${ticketId}"][data-comment-id="${commentId}"]`);
      if (button) expand(button).catch(error => { if (button.isConnected) report(error); });
    }
  }

  async function refresh({ metadata = false, force = false, targetIndex = index } = {}) {
    if (!active || !id || settings || (elements.editorDialog.open && !force)) return;
    const seq = ++request;
    const scope = session;
    const valid = () => active && session === scope && request === seq && !settings;
    let nextSaved = saved;
    let nextCatalog = catalog;
    if (metadata || !nextSaved) {
      [nextSaved, { boards: nextCatalog }] = await Promise.all([api(`${base}/${id}`), api(`${base}/catalog`)]);
      if (!valid()) return;
    }
    const nextDisplay = displayVersion == null ? appearanceOf(nextSaved) : display;
    const def = { ...definitionOf(nextSaved), ...nextDisplay };
    const key = JSON.stringify(def);
    const result = await readViewPage(query, def, key === cursorDefinition ? cursors : [null], targetIndex, valid);
    if (!valid() || !result) return;
    const changed = !page || !saved || nextSaved.version !== saved.version
      || (nextCatalog !== catalog && JSON.stringify(nextCatalog) !== JSON.stringify(catalog))
      || result.page.revision !== page.revision || result.index !== index || key !== cursorDefinition
      || !panel.querySelector("#custom-view-total");
    saved = nextSaved;
    catalog = nextCatalog;
    display = nextDisplay;
    page = result.page;
    index = result.index;
    cursors = result.cursors;
    cursorDefinition = key;
    if (changed || force) paint();
  }

  async function reconcile() {
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    const scope = session;
    try {
      await loadLinks();
      if (active && scope === session && !settings && !elements.editorDialog.open && !saving && !restoring) {
        await refresh({ metadata: true });
      }
    } catch (error) {
      if (scope === session && error.status === 404 && active && !settings) unavailable();
      else if (scope === session) report(error);
    } finally {
      refreshing = false;
      if (refreshAgain) { refreshAgain = false; schedule(); }
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; void reconcile(); }, 100);
  }

  function connect() {
    if (source || !globalThis.EventSource) return;
    source = new EventSource(`${base}/events`);
    source.onmessage = schedule;
    source.onopen = schedule;
  }

  function clearSession() {
    ++session;
    ++request;
    ++opening;
    ++previewRequest;
    clearTimeout(previewTimer);
    settings = null;
    origin = null;
    restoring = null;
    saved = null;
    page = null;
    displayVersion = null;
    display = null;
    index = 0;
    cursors = [null];
  }

  function leave() {
    if (!active) return;
    clearSession();
    active = false;
    id = null;
    clearTimeout(timer);
    timer = null;
    source?.close();
    source = null;
    panel.hidden = true;
    panel.replaceChildren();
    backButton.hidden = true;
    ctx.endBoardOverride();
    updateLinks();
  }

  function unavailable() {
    ++request;
    saved = null;
    page = null;
    panel.innerHTML = `<header class="cv-header"><h2 tabindex="-1" id="custom-view-heading">${t("View unavailable")}</h2></header><p>${t("This view may have been deleted. Select another view or board.")}</p>`;
  }

  async function enter(viewId, { writeUrl = true, edit = false } = {}) {
    if (!active) ctx.beginBoardOverride();
    clearSession();
    active = true;
    id = viewId;
    const scope = session;
    if (writeUrl) setPath(currentPath());
    panel.hidden = false;
    backButton.hidden = false;
    panel.scrollTop = 0;
    panel.innerHTML = `<p role="status">${t("Loading...")}</p>`;
    updateLinks();
    connect();
    try {
      if (viewId) await refresh({ metadata: true });
      else {
        const result = await api(`${base}/catalog`);
        if (scope !== session) return;
        catalog = result.boards;
      }
      if (scope !== session) return;
      if (!viewId || edit) editSettings();
      else panel.querySelector("#custom-view-heading")?.focus({ preventScroll: true });
    } catch (error) {
      if (scope === session) {
        unavailable();
        if (error.status !== 404) report(error);
      }
    }
  }

  async function mayLeave() {
    if (saving) return false;
    if (!isDirty()) return true;
    return ctx.confirmAndRun({ title: t("Discard changes?"), message: t("Your unsaved changes will be lost."), submitLabel: t("Discard changes"), run: async () => {} });
  }

  function editSettings() {
    ++opening;
    ++request;
    const def = saved ? { ...definitionOf(saved), ...display } : emptyDefinition();
    settings = createViewSettings(panel, def, catalog, { escapeHtml: esc, editing: Boolean(id), onChange: preview, onSave: save });
    initialForm = JSON.stringify(settings.readDefinition());
    preview(def);
  }

  function preview(def) {
    const seq = ++previewRequest;
    clearTimeout(previewTimer);
    const target = panel.querySelector(".cv-preview");
    target.textContent = "";
    if (def.scope === "selected" && !def.boardIds.length) return;
    previewTimer = setTimeout(async () => {
      try {
        const result = await query({ definition: { ...def, name: def.name || t("New custom view"), showBody: false, showLatestComment: false }, limit: 1 });
        if (seq === previewRequest && target.isConnected) {
          target.textContent = result.total === 1 ? t("1 matching ticket · archived tickets excluded")
            : t("{count} matching tickets · archived tickets excluded", { count: result.total });
        }
      } catch (error) { if (seq === previewRequest && target.isConnected) target.textContent = error.message; }
    }, 180);
  }

  async function save(def, version = saved?.version) {
    if (saving) return;
    if (!def.name || (def.scope === "selected" && !def.boardIds.length)) {
      showError(new Error(t("Enter a name and select at least one target board.")));
      return;
    }
    const scope = session;
    saving = true;
    panel.inert = true;
    try {
      const updated = await sendJson(id ? `${base}/${id}` : base, { method: id ? "PUT" : "POST", body: id ? { ...def, expectedVersion: version } : def });
      if (session !== scope) return;
      const wasNew = !id;
      if (wasNew) setPath(`/views/${updated.id}`, true);
      panel.inert = false;
      await enter(updated.id);
      await loadLinks();
      ctx.showToast(t("View saved"));
    } catch (error) {
      if (scope === session) showError(error.status === 409 && !settings ? new Error(t("This view changed. Revert the display settings before saving again.")) : error);
    } finally {
      saving = false;
      panel.inert = false;
    }
  }

  async function cancelSettings() {
    if (!id) return ctx.returnToBoard();
    settings = null;
    ++previewRequest;
    await refresh({ metadata: true, force: true });
    panel.querySelector('[data-view-action="edit"]')?.focus();
  }

  async function remove() {
    const viewId = id;
    const version = saved.version;
    await ctx.confirmAndRun({
      title: t("Delete view"), message: t('Delete the saved view “{name}”? Its tickets will stay on their boards.', { name: saved.name }),
      submitLabel: t("Delete"),
      run: async () => {
        await api(`${base}/${viewId}?expectedVersion=${version}`, { method: "DELETE" });
        if (id !== viewId) return;
        await loadLinks();
        if (summaries.length) await enter(summaries[0].id);
        else await ctx.returnToBoard();
      },
    });
  }

  async function expand(button) {
    const field = button.dataset.viewExpand;
    const ticketId = Number(button.dataset.rowId);
    const row = page.tickets.find(row => row.id === ticketId);
    const part = field === "body" ? row.body : row.latestComment;
    const paragraph = button.parentElement.querySelector("p");
    if (button.getAttribute("aria-expanded") === "true") {
      paragraph.textContent = part.excerpt + "…";
      button.textContent = t("Show full text");
      button.setAttribute("aria-expanded", "false");
      return;
    }
    const args = new URLSearchParams({ field });
    if (field === "comment") args.set("commentId", part.id);
    if (button.getAttribute("aria-busy") === "true") return;
    button.setAttribute("aria-busy", "true");
    let full;
    try { full = await api(`${base}/tickets/${ticketId}/text?${args}`); }
    finally { button.removeAttribute("aria-busy"); }
    if (!button.isConnected) return;
    paragraph.textContent = full.bodyMarkdown;
    button.textContent = t("Show excerpt");
    button.setAttribute("aria-expanded", "true");
  }

  async function openTicket(ticketId, owner) {
    if (!active || !saved || settings) return;
    const seq = ++opening;
    const scope = session;
    const valid = () => active && seq === opening && scope === session;
    const rows = page?.tickets ?? [];
    const position = rows.findIndex(row => row.id === ticketId);
    const linked = elements.editorDialog.open && origin;
    const nextOrigin = linked || { viewId: id, session, ticketId, position, ids: rows.map(row => row.id), index, scroll: panel.scrollTop };
    const previousBoard = { activeBoardId: state.activeBoardId, boardDetail: state.boardDetail };
    if (linked) elements.editorDialog.inert = true;
    try {
      if (!owner) owner = (await api(`/api/tickets/${ticketId}`)).boardId;
      if (!valid() || (linked && !elements.editorDialog.open)) return;
      const board = await api(`/api/boards/${owner}`);
      if (!valid() || (linked && !elements.editorDialog.open)) return;
      state.activeBoardId = owner;
      state.boardDetail = { ...board, tickets: [] };
      state.boardTickets = [];
      origin = nextOrigin;
      await ctx.openEditor(ticketId, valid);
    } catch (error) {
      if (valid()) {
        Object.assign(state, previousBoard);
        origin = linked || null;
        report(error);
        schedule();
      }
    } finally {
      if (linked) elements.editorDialog.inert = false;
    }
  }

  async function returned() {
    const target = origin;
    if (!active || !target || target.session !== session || elements.editorDialog.open) return;
    origin = null;
    restoring = target;
    const focusBefore = document.activeElement;
    try {
      await refresh({ metadata: true, force: true, targetIndex: target.index });
    } catch (error) { if (target.session === session) { if (error.status === 404) unavailable(); else report(error); } }
    if (restoring === target) restoring = null;
    if (target.session !== session || elements.editorDialog.open || origin) return;
    if (document.activeElement !== focusBefore && document.activeElement !== document.body && !panel.contains(document.activeElement)) return;
    const replacement = index === target.index && target.position >= 0 ? page?.tickets[target.position]?.id : null;
    const candidates = [target.ticketId, ...target.ids.slice(target.position + 1), replacement, ...target.ids.slice(0, target.position).reverse()];
    if (index < target.index) candidates.push(page?.tickets.at(-1)?.id);
    const button = candidates.filter(Boolean).map(id => panel.querySelector(`[data-view-ticket="${id}"]`)).find(Boolean) ?? panel.querySelector("#custom-view-heading");
    panel.scrollTop = target.scroll;
    button?.focus({ preventScroll: true });
    if (button && button !== panel.querySelector("#custom-view-heading")) button.scrollIntoView({ block: "nearest" });
  }

  function plainClick(event) { return !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0; }
  links.addEventListener("click", event => {
    const link = event.target.closest("[data-custom-view-id]");
    if (!link || !plainClick(event)) return;
    event.preventDefault();
    mayLeave().then(ok => ok && enter(Number(link.dataset.customViewId))).catch(report);
  });
  newButton.addEventListener("click", () => mayLeave().then(ok => ok && enter(null)).catch(report));
  backButton.addEventListener("mousedown", event => event.preventDefault());
  backButton.addEventListener("click", () => ctx.requestCloseEditor());
  elements.editorDialog.addEventListener("click", async event => {
    if (!active || !plainClick(event)) return;
    const link = event.target.closest("a[href]");
    if (!link || link.target || link.origin !== location.origin) return;
    const match = /^\/tickets\/([1-9]\d*)$/.exec(link.pathname);
    if (!match) return;
    event.preventDefault();
    const detail = state.dialogTicket;
    if (await ctx.confirmDiscardChanges() && elements.editorDialog.open && detail === state.dialogTicket) {
      await openTicket(Number(match[1]));
    }
  });
  panel.addEventListener("change", async event => {
    const property = event.target.dataset.viewAppearance;
    if (!property) return;
    displayVersion ??= saved.version;
    display = { ...display, [property]: event.target.checked };
    if (display.showBody === saved.showBody && display.showLatestComment === saved.showLatestComment) displayVersion = null;
    try { await refresh({ force: true }); } catch (error) { report(error); }
  });
  panel.addEventListener("click", async event => {
    const button = event.target.closest("button,a");
    if (!button) return;
    try {
      if (button.dataset.viewTicket) {
        if (!plainClick(event)) return;
        event.preventDefault();
        await openTicket(Number(button.dataset.viewTicket), Number(button.dataset.owner));
      } else if (button.dataset.viewExpand) await expand(button);
      else switch (button.dataset.viewAction) {
        case "edit": editSettings(); break;
        case "cancel": await cancelSettings(); break;
        case "delete": await remove(); break;
        case "save-display": await save({ ...definitionOf(saved), ...display }, displayVersion); break;
        case "revert-display":
          displayVersion = null;
          await refresh({ metadata: true, force: true });
          panel.querySelector("[data-view-appearance]")?.focus();
          break;
        case "next": case "previous":
          await refresh({ targetIndex: index + (button.dataset.viewAction === "next" ? 1 : -1), force: true });
          panel.scrollTop = 0;
          panel.querySelector("[data-view-ticket]")?.focus({ preventScroll: true });
          break;
      }
    } catch (error) { report(error); }
  });
  const onVisible = () => { if (!document.hidden) schedule(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  window.addEventListener("focus", onVisible);
  return { enter, leave, refresh, mayLeave, isDirty, openTicket, returned, loadLinks, schedule, currentPath, setPath,
    get active() { return active; }, get id() { return id; }, get origin() { return origin; } };
}
