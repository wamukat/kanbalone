// @ts-check
import { t } from "./app-i18n.js";
import { icon } from "./icons.js";

/** @typedef {{number: number, bodyMarkdown: string, bodyHtml: string, done: boolean, revision: number}} TicketTask */
/** @typedef {{number: number | null, originalBody: string, revision: number | null, removed: boolean}} TaskDraft */
/** @typedef {{ticketId: number, isCurrent: () => boolean, tasks: TicketTask[], loaded: boolean,
 * loading: boolean, loadVersion: number, refreshQueued: boolean, busy: boolean, draft: TaskDraft | null,
 * error: string, status: string, reloadNeeded: boolean}} TaskSession */
/** @typedef {{
 * api: (path: string) => Promise<unknown>,
 * sendJson: (path: string, options: {method: string, body?: object}) => Promise<unknown>,
 * escapeHtml: (value: string) => string,
 * confirmAndRun: (options: {title: string, message: string, submitLabel: string, run: () => Promise<void>}) => Promise<boolean>,
 * captureDialogScope: () => () => boolean,
 * onSaved: (ticketId: number) => Promise<void>,
 * isSaveShortcut: (event: KeyboardEvent) => boolean,
 * imageAttachments: {
 *   bind: (input: HTMLTextAreaElement, isCurrent: () => boolean) => void,
 *   reset: (input: HTMLTextAreaElement) => void,
 *   isPending: (input: HTMLTextAreaElement) => boolean,
 *   canSave: (input: HTMLTextAreaElement) => boolean
 * }
 * }} TaskContext */

const foldAscii = /** @param {string} value */ (value) => value.replace(/[A-Z]/g, letter => letter.toLowerCase());

/** @param {HTMLElement} host @param {TaskContext} ctx */
export function createTicketTasks(host, ctx) {
  const { escapeHtml: esc, imageAttachments } = ctx;
  host.innerHTML = `
    <header class="ticket-task-heading">
      <h3 id="ticket-tasks-heading">${esc(t("Tasks"))}</h3>
      <button id="ticket-task-add" type="button" class="ghost action-with-icon" aria-controls="ticket-task-form" aria-expanded="false">
        ${icon("plus")}<span>${esc(t("Add Task"))}</span>
      </button>
    </header>
    <div class="ticket-task-controls">
      <input id="ticket-task-query" type="search" placeholder="${esc(t("Search Task text"))}" aria-label="${esc(t("Search Task text"))}" autocomplete="off" />
      <button id="ticket-task-open-only" type="button" class="ghost group-text-action ticket-task-open-only" aria-pressed="false">
        ${icon("circle")}<span>${esc(t("Open only"))}</span>
      </button>
    </div>
    <form id="ticket-task-form" class="ticket-task-form" hidden>
      <label for="ticket-task-body">${esc(t("Task text (Markdown)"))}</label>
      <textarea id="ticket-task-body" class="ticket-detail-body-input" rows="4" required></textarea>
      <div class="editor-actions-right">
        <button id="ticket-task-cancel" type="button" class="ghost">${esc(t("Cancel"))}</button>
        <button id="ticket-task-save" type="submit" class="primary-action" aria-keyshortcuts="Control+Enter Meta+Enter">${esc(t("Add"))}</button>
      </div>
    </form>
    <div class="ticket-task-notice">
      <p id="ticket-task-error" class="completion-error" role="alert" hidden></p>
      <button id="ticket-task-reload" type="button" class="ghost" hidden>${esc(t("Reload Tasks"))}</button>
      <p id="ticket-task-status" class="muted" role="status" hidden></p>
    </div>
    <ul id="ticket-task-list" class="ticket-task-list" aria-label="${esc(t("Tasks"))}" hidden></ul>
    <p id="ticket-task-empty" class="muted" hidden></p>
  `;
  const add = /** @type {HTMLButtonElement} */ (host.querySelector("#ticket-task-add"));
  const query = /** @type {HTMLInputElement} */ (host.querySelector("#ticket-task-query"));
  const openOnly = /** @type {HTMLButtonElement} */ (host.querySelector("#ticket-task-open-only"));
  const form = /** @type {HTMLFormElement} */ (host.querySelector("#ticket-task-form"));
  const body = /** @type {HTMLTextAreaElement} */ (host.querySelector("#ticket-task-body"));
  const save = /** @type {HTMLButtonElement} */ (host.querySelector("#ticket-task-save"));
  const cancel = /** @type {HTMLButtonElement} */ (host.querySelector("#ticket-task-cancel"));
  const reload = /** @type {HTMLButtonElement} */ (host.querySelector("#ticket-task-reload"));
  const error = /** @type {HTMLElement} */ (host.querySelector("#ticket-task-error"));
  const status = /** @type {HTMLElement} */ (host.querySelector("#ticket-task-status"));
  const notice = /** @type {HTMLElement} */ (host.querySelector(".ticket-task-notice"));
  const list = /** @type {HTMLElement} */ (host.querySelector("#ticket-task-list"));
  const empty = /** @type {HTMLElement} */ (host.querySelector("#ticket-task-empty"));

  /** @type {TaskSession | null} */
  let active = null;
  /** @param {TaskSession} session */
  const current = (session) => active === session && session.isCurrent();
  /** @param {TaskSession} session @param {number | null} [number] */
  const endpoint = (session, number = null) => `/api/tickets/${session.ticketId}/tasks${number === null ? "" : `/${number}`}`;

  imageAttachments.bind(body, () => Boolean(active?.draft && current(active)));

  function hasUnsaved() {
    return Boolean(active?.draft && (body.value !== active.draft.originalBody || imageAttachments.isPending(body)));
  }

  /** @param {TaskSession} session */
  function renderControls(session) {
    const { busy, draft } = session;
    add.disabled = busy || !session.loaded;
    form.hidden = !draft;
    add.setAttribute("aria-expanded", String(draft?.number === null));
    body.readOnly = busy;
    save.disabled = busy || !draft || draft.removed || session.reloadNeeded;
    cancel.disabled = busy;
    save.textContent = t(draft?.number === null ? "Add" : "Save");
    reload.hidden = !session.reloadNeeded;
    reload.disabled = session.loading;
    error.textContent = session.error;
    error.hidden = !session.error;
    status.textContent = session.status;
    status.hidden = !session.status;
  }

  const doneLabel = /** @param {TicketTask} task */ (task) => t(task.done ? "Reopen Task #{number}" : "Complete Task #{number}", { number: task.number });

  /** @param {TicketTask} task @param {boolean} busy */
  function renderTaskRow(task, busy) {
    const disabled = busy ? "disabled" : "";
    const deleteLabel = esc(t("Delete Task #{number}", { number: task.number }));
    return `
      <li class="ticket-task-item" data-task-number="${task.number}">
        <input type="checkbox" data-task-done ${task.done ? "checked" : ""} ${disabled}
          aria-label="${esc(doneLabel(task))}" />
        <div class="ticket-task-content">
          <span class="ticket-task-number" data-task-edit-number>${esc(t("Task #{number}", { number: task.number }))}</span>
          <div class="ticket-task-current-label muted" hidden>${esc(t("Current saved Task"))}</div>
          <button type="button" class="visually-hidden ticket-task-edit-trigger" data-task-edit aria-controls="ticket-task-form"
            ${disabled} aria-label="${esc(t("Edit Task #{number}", { number: task.number }))}"></button>
          <div class="markdown ticket-task-markdown" data-task-edit-content>${task.bodyHtml}</div>
        </div>
        <button type="button" class="ghost icon-button danger ticket-task-delete" data-task-delete ${disabled}
          title="${deleteLabel}" aria-label="${deleteLabel}">${icon("trash-2")}</button>
      </li>
    `;
  }

  /** @param {TaskSession} session @param {Element} row */
  function syncInlineEditor(session, row) {
    const draft = session.draft;
    const task = session.tasks.find(item => item.number === draft?.number);
    const input = /** @type {HTMLInputElement} */ (row.querySelector("[data-task-done]"));
    const edit = /** @type {HTMLButtonElement} */ (row.querySelector("[data-task-edit]"));
    const remove = /** @type {HTMLButtonElement} */ (row.querySelector("[data-task-delete]"));
    const preview = /** @type {HTMLElement} */ (row.querySelector("[data-task-edit-content]"));
    const currentLabel = /** @type {HTMLElement} */ (row.querySelector(".ticket-task-current-label"));
    input.disabled = remove.disabled = session.busy || !task;
    if (task) {
      input.checked = task.done;
      input.setAttribute("aria-label", doneLabel(task));
    }
    edit.hidden = true;
    preview.hidden = currentLabel.hidden = !task || task.bodyMarkdown === draft?.originalBody;
    if (task && !preview.hidden && preview.innerHTML !== task.bodyHtml) preview.innerHTML = task.bodyHtml;
    if (!row.contains(form)) preview.after(form, notice);
  }

  /** @param {TaskSession} session */
  function renderList(session) {
    const needle = foldAscii(query.value);
    const onlyOpen = openOnly.getAttribute("aria-pressed") === "true";
    const editingNumber = session.draft?.number ?? null;
    const visible = session.tasks.filter(task => task.number === editingNumber
      || ((!onlyOpen || !task.done) && foldAscii(task.bodyMarkdown).includes(needle)));
    const editingRow = form.closest("[data-task-number]");
    const focused = document.activeElement;
    const focusedNumber = focused?.closest("[data-task-number]")?.getAttribute("data-task-number");
    const focusedAction = ["done", "edit", "delete"].find(action => focused?.hasAttribute(`data-task-${action}`));
    const markup = (/** @type {TicketTask[]} */ rows) => rows.map(task => renderTaskRow(task, session.busy)).join("");
    if (editingRow && editingNumber !== null) {
      // Keep the live editor mounted through filters, SSE and conflict reloads.
      for (const row of [...list.children]) {
        if (row !== editingRow) row.remove();
      }
      editingRow.insertAdjacentHTML("beforebegin", markup(visible.filter(task => task.number < editingNumber)));
      editingRow.insertAdjacentHTML("afterend", markup(visible.filter(task => task.number > editingNumber)));
      syncInlineEditor(session, editingRow);
    } else {
      list.innerHTML = markup(visible);
      const editRow = list.querySelector(`[data-task-number="${editingNumber}"]`);
      if (editRow) syncInlineEditor(session, editRow);
    }
    list.hidden = list.childElementCount === 0;
    empty.hidden = !list.hidden || (!session.loaded && !session.loading);
    empty.textContent = t(!session.loaded ? "Loading Tasks…" : session.tasks.length ? "No matching Tasks." : "No Tasks yet.");
    if (focusedNumber && focusedAction && focused !== document.activeElement) {
      const selector = `[data-task-${focusedAction}]:not([hidden]):not(:disabled)`;
      const next = list.querySelector(`[data-task-number="${focusedNumber}"] ${selector}`) ?? list.querySelector(selector) ?? add;
      if (next instanceof HTMLElement) next.focus({ preventScroll: true });
    }
  }

  /** @param {TaskSession} session @param {boolean} [resolveConflict] */
  async function load(session, resolveConflict = false) {
    if (!current(session)) return;
    if (session.busy || (session.loading && !resolveConflict)) {
      session.refreshQueued = true;
      return;
    }
    const version = ++session.loadVersion;
    session.loading = true;
    renderControls(session);
    if (!session.loaded) renderList(session);
    try {
      const result = /** @type {{tasks: TicketTask[]}} */ (await ctx.api(endpoint(session)));
      if (!current(session) || version !== session.loadVersion) return;
      session.tasks = result.tasks;
      session.loaded = true;
      if (resolveConflict) {
        session.reloadNeeded = false;
        session.error = "";
        const draft = session.draft;
        if (draft && draft.number !== null) {
          const latest = session.tasks.find(task => task.number === draft.number);
          draft.removed = !latest;
          if (latest) {
            draft.revision = latest.revision;
            session.status = t("Tasks reloaded. Review the current Task before saving your draft.");
          } else {
            session.error = t("This Task no longer exists. Your draft is still available.");
          }
        } else {
          session.status = t("Tasks reloaded.");
        }
      } else if (session.error && session.error === t("Tasks could not be loaded.")) {
        session.error = "";
        session.reloadNeeded = false;
      }
      renderList(session);
    } catch {
      if (!current(session) || version !== session.loadVersion) return;
      if (!session.loaded || resolveConflict) {
        session.error = t("Tasks could not be loaded.");
        session.reloadNeeded = true;
      }
    } finally {
      if (current(session) && version === session.loadVersion) {
        session.loading = false;
        renderControls(session);
        if (!session.loaded) renderList(session);
        flushQueuedRefresh(session);
      }
    }
  }

  /** @param {TaskSession} session */
  function flushQueuedRefresh(session) {
    if (!session.refreshQueued) return;
    session.refreshQueued = false;
    void load(session);
  }

  function reset() {
    active = null;
    if (list.contains(form)) list.before(form, notice);
    imageAttachments.reset(body);
    body.value = "";
    query.value = "";
    openOnly.setAttribute("aria-pressed", "false");
    openOnly.classList.remove("active");
    host.hidden = true;
  }

  /** @param {number} ticketId */
  function open(ticketId) {
    if (active?.ticketId === ticketId && current(active)) return;
    reset();
    active = { ticketId, isCurrent: ctx.captureDialogScope(), tasks: [], loaded: false, loading: false,
      loadVersion: 0, refreshQueued: false, busy: false, draft: null, error: "", status: "", reloadNeeded: false };
    host.hidden = false;
    void load(active);
  }

  /** @param {TaskSession} session */
  function clearDraft(session) {
    if (list.contains(form)) list.before(form, notice);
    imageAttachments.reset(body);
    body.value = "";
    session.draft = null;
    renderControls(session);
  }

  /** @param {TaskSession} session */
  async function mayDiscard(session) {
    if (!current(session) || session.busy) return false;
    if (!hasUnsaved()) return true;
    const selection = [body.selectionStart, body.selectionEnd];
    const discard = await ctx.confirmAndRun({
      title: t("Discard changes?"), message: t("Your unsaved changes will be lost."),
      submitLabel: t("Discard changes"), run: async () => {},
    });
    if (!current(session)) return false;
    if (!discard) {
      body.focus({ preventScroll: true });
      body.setSelectionRange(selection[0], selection[1]);
    }
    return discard;
  }

  /** @param {TaskSession} session @param {TicketTask | null} task */
  async function startDraft(session, task) {
    if (task && session.draft?.number === task.number) return;
    if (!await mayDiscard(session)) return;
    if (task && !session.tasks.some(item => item.number === task.number)) return;
    clearDraft(session);
    const originalBody = task?.bodyMarkdown ?? "";
    session.draft = { number: task?.number ?? null, originalBody, revision: task?.revision ?? null, removed: false };
    body.value = originalBody;
    session.status = "";
    renderControls(session);
    renderList(session);
    body.focus();
  }

  /** @param {TaskSession} session @param {"POST" | "PATCH" | "DELETE"} method
   * @param {number | null} number @param {{bodyMarkdown?: string, done?: boolean, expectedRevision?: number | null}} payload @param {boolean} [savedDraft]
   * @param {HTMLElement | null} [origin] */
  async function mutate(session, method, number, payload, savedDraft = false, origin = null) {
    if (!current(session) || session.busy) return;
    ++session.loadVersion;
    session.loading = false;
    session.busy = true;
    session.error = "";
    session.status = "";
    renderControls(session);
    // Keep the initiating DOM control mounted until the request finishes.
    list.querySelectorAll("[data-task-done], [data-task-edit], [data-task-delete]").forEach(control => control.setAttribute("disabled", ""));
    try {
      const task = /** @type {TicketTask | null} */ (await ctx.sendJson(endpoint(session, number), { method, body: payload }));
      if (!current(session)) return;
      if (method === "DELETE") {
        session.tasks = session.tasks.filter(row => row.number !== number);
        if (session.draft?.number === number) session.draft.removed = true;
      } else if (task) {
        session.tasks = method === "POST" ? [...session.tasks, task] : session.tasks.map(row => row.number === number ? task : row);
        const draft = session.draft;
        if (!savedDraft && draft?.number === task.number && draft.revision === payload.expectedRevision
            && draft.originalBody === task.bodyMarkdown) draft.revision = task.revision;
      }
      if (savedDraft) clearDraft(session);
      session.status = t(method === "POST" ? "Task added." : method === "DELETE" ? "Task deleted." : "Task updated.");
      // A refresh error must not turn an already successful write into a retry.
      void ctx.onSaved(session.ticketId).catch(() => {});
    } catch (err) {
      if (!current(session)) return;
      const operationError = /** @type {{status?: number} | null} */ (err);
      session.reloadNeeded = operationError?.status === 409 || operationError?.status === 428
        || (number !== null && operationError?.status === 404);
      session.error = session.reloadNeeded
        ? t("The Task changed. Reload Tasks before trying again. Your draft will be kept.")
        : err instanceof Error ? err.message : t("Task could not be saved.");
    } finally {
      if (current(session)) {
        session.busy = false;
        renderControls(session);
        const restore = document.activeElement === document.body && origin !== null;
        const action = ["done", "edit", "delete"].find(key => origin?.hasAttribute(`data-task-${key}`));
        renderList(session);
        if (restore && action) {
          const same = list.querySelector(`[data-task-number="${number}"] [data-task-${action}]`);
          (same instanceof HTMLElement ? same : add).focus({ preventScroll: true });
        } else if (savedDraft && !session.draft && document.activeElement === document.body) {
          const trigger = list.querySelector(`[data-task-number="${number}"] [data-task-edit]`);
          (trigger instanceof HTMLButtonElement ? trigger : add).focus({ preventScroll: true });
        }
        flushQueuedRefresh(session);
      }
    }
  }

  add.addEventListener("click", () => {
    if (active) void startDraft(active, null);
  });
  query.addEventListener("input", () => { if (active) renderList(active); });
  openOnly.addEventListener("click", () => {
    const pressed = String(openOnly.getAttribute("aria-pressed") !== "true");
    openOnly.setAttribute("aria-pressed", pressed);
    openOnly.classList.toggle("active", pressed === "true");
    if (active) renderList(active);
  });
  reload.addEventListener("click", () => { if (active) void load(active, true); });
  cancel.addEventListener("click", async () => {
    const session = active;
    if (session && await mayDiscard(session)) {
      const number = session.draft?.number;
      clearDraft(session);
      renderList(session);
      const edit = number == null ? null : list.querySelector(`[data-task-number="${number}"] [data-task-edit]`);
      (edit instanceof HTMLElement ? edit : add).focus({ preventScroll: true });
    }
  });
  form.addEventListener("keydown", event => {
    if (!ctx.isSaveShortcut(event)) return;
    event.preventDefault();
    if (!event.repeat && !save.disabled) form.requestSubmit();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const session = active;
    const draft = session?.draft;
    if (!session || !draft || save.disabled || !imageAttachments.canSave(body)) return;
    const bodyMarkdown = body.value;
    if (!bodyMarkdown.trim()) {
      session.error = t("Enter Task text.");
      renderControls(session);
      body.focus();
      return;
    }
    const payload = draft.number === null ? { bodyMarkdown } : { bodyMarkdown, expectedRevision: draft.revision };
    void mutate(session, draft.number === null ? "POST" : "PATCH", draft.number, payload, true);
  });
  list.addEventListener("change", event => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.hasAttribute("data-task-done")) return;
    const input = event.target;
    const session = active;
    const number = Number(input.closest("[data-task-number]")?.getAttribute("data-task-number"));
    const task = session?.tasks.find(row => row.number === number);
    if (!session || !task) return;
    const done = input.checked;
    input.checked = task.done;
    void mutate(session, "PATCH", number, { done, expectedRevision: task.revision }, false, input);
  });
  list.addEventListener("click", event => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const control = event.target.closest("[data-task-edit-content], [data-task-edit-number], button[data-task-edit], button[data-task-delete]");
    if (!control) return;
    const session = active;
    const number = Number(control.closest("[data-task-number]")?.getAttribute("data-task-number"));
    const task = session?.tasks.find(row => row.number === number);
    if (!session || !task || !current(session) || session.busy) return;
    if (!control.hasAttribute("data-task-delete")) {
      if (!control.hasAttribute("data-task-edit")) {
        if (event.target.closest("a, img, button, input, select, textarea, summary")) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.containsNode(control, true)) return;
      }
      void startDraft(session, task);
      return;
    }
    void ctx.confirmAndRun({
      title: t("Delete Task #{number}?", { number }),
      message: t("This Task will be removed. Its number will not be reused."),
      submitLabel: t("Delete"),
      run: () => mutate(session, "DELETE", number, { expectedRevision: task.revision }, false,
        control instanceof HTMLElement ? control : null),
    });
  });

  return {
    open,
    reset,
    refresh: () => active ? load(active) : Promise.resolve(),
    hasUnsaved,
    isSaving: () => active?.busy === true,
  };
}
