// @ts-check
import { t as tr, getLocale } from "./app-i18n.js";
import { collectTicketPages, readTicketPage } from "./app-ticket-pages.js";
import { captureGroupTicketAnchor, createGroupTicketWindow, restoreGroupTicketAnchor } from "./app-group-ticket-window.js";
import { createGroupWindowSearch } from "./app-group-window-search.js";
import { createGroupRowIconRenderer } from "./app-group-row-icons.js";
/**
 * @typedef {import("./app-group-types.js").GroupView} GroupView
 * @typedef {import("./app-group-types.js").GroupSummary} GroupSummary
 * @typedef {import("./app-group-types.js").GroupSelection} GroupSelection
 * @typedef {import("./app-group-types.js").GroupTicket} GroupTicket
 * @typedef {import("./app-group-types.js").GroupPreview} GroupPreview
 */
import {
  relatedTickets,
  renderGroupOptions,
  renderGroupViewSections,
} from "./app-group-view.js";

// Keep the board sidebar intact: group selection and ticket families share the content area.
// Existing surface, accent and spacing tokens keep this occasional grouping task quiet.
/** @param {import("./app-group-types.js").GroupContext} ctx */
export function createGroupBoardModule(ctx) {
  const { state, elements } = ctx;
  const host = elements.groupBoard;
  const getRowIcon = createGroupRowIconRenderer(host);
  const esc = ctx.escapeHtml;
  /** @type {number | null} */ let boardId = null;
  /** @type {GroupSummary[]} */ let groups = [];
  /** @type {GroupSelection} */ let selectedId = null;
  /** @type {GroupSelection} */ let loadedSelection = null;
  /** @type {GroupView | null} */ let selected = null;
  /** @type {GroupTicket[]} */ let tickets = [];
  let ungroupedTicketCount = 0;
  let all = false,
    sort = "createdAt:asc",
    showArchived = false;
  let createName = "",
    renameName = "";
  /** @type {import("./app-group-types.js").GroupTarget | null} */ let renameTarget =
    null;
  /** @type {import("./app-group-types.js").GroupTarget | null} */ let descriptionTarget =
    null;
  let creating = false,
    renaming = false,
    descriptionEditing = false,
    descriptionDraft = "",
    expanded = false;
  /** @type {string | null} */ let descriptionPreview = null;
  /** @type {number | null} */ let addGroupId = null;
  let adding = false,
    query = "",
    activeOption = 0;
  /** @type {GroupTicket[]} */ let candidates = [];
  /** @type {number[]} */ let chosen = [];
  let ticketRevision = 0;
  let renderedTicketKey = "";
  let renderedBusy = false;
  let renderedViewScope = "";
  /** @type {ReturnType<typeof createGroupTicketWindow> | null} */ let ticketWindow = null;
  /** @type {ReturnType<typeof createGroupWindowSearch> | null} */ let ticketSearch = null;
  /** @type {Record<string, HTMLElement> | null} */
  let sections = null;
  /** @type {Record<string, string>} */
  let sectionHtml = {};

  // Compare the fields used by Group rows/order/counts only when a collection
  // arrives. Form edits must not rescan or serialize the ticket collection.
  /** @param {GroupTicket[]} next */
  function receiveTickets(next) {
    const same = tickets.length === next.length && tickets.every((previous, index) => {
      const current = next[index];
      return previous.id === current.id && previous.title === current.title
        && previous.laneId === current.laneId && previous.parentTicketId === current.parentTicketId
        && previous.hasChildren === current.hasChildren && previous.priority === current.priority
        && previous.isResolved === current.isResolved && previous.isArchived === current.isArchived
        && previous.tags.length === current.tags.length && previous.tags.every((tag, tagIndex) => {
          const currentTag = current.tags[tagIndex];
          return tag.id === currentTag.id && tag.name === currentTag.name && tag.color === currentTag.color;
        });
    });
    if (!same) ticketRevision += 1;
    tickets = next;
  }

  function syncTicketBusy() {
    if (!sections || renderedBusy === busy) return;
    for (const button of sections.tickets.querySelectorAll("[data-group-remove]")) {
      if (button instanceof HTMLButtonElement) button.disabled = busy;
    }
    ticketWindow?.setBusy(busy);
    renderedBusy = busy;
  }

  let busy = false,
    error = "",
    generation = 0;

  /** @param {string} selector */
  function focus(selector) {
    const element = host.querySelector(selector);
    if (element instanceof HTMLElement) element.focus();
  }
  /** @param {number | null} targetBoardId @param {number | null} targetGroupId */
  function focusMembershipAction(targetBoardId, targetGroupId) {
    if (state.viewMode === "group" && state.activeBoardId === targetBoardId && selectedId === targetGroupId) {
      focus('[data-group-action="add"]');
    }
  }
  /** @param {HTMLInputElement} input */
  function renderOptions(input) {
    const options = host.querySelector("#group-ticket-options");
    if (options) options.innerHTML = renderGroupOptions({ candidates, chosen, query, activeOption }, esc);
    input.setAttribute("aria-expanded", String(!!query.trim()));
    input.removeAttribute("aria-activedescendant");
  }

  const sortKey = () => `kanbalone:group-sort:${state.activeBoardId}`;
  /** @param {number | null} nextBoardId */
  function reset(nextBoardId) {
    boardId = nextBoardId;
    groups = [];
    selectedId = null;
    loadedSelection = null;
    selected = null;
    ungroupedTicketCount = 0;
    receiveTickets([]);
    all = false;
    showArchived = false;
    creating = false;
    renaming = false;
    descriptionEditing = false;
    adding = false;
    expanded = false;
    error = "";
    try {
      sort = localStorage.getItem(sortKey()) || "createdAt:asc";
    } catch {
      sort = "createdAt:asc";
    }
    if (
      !["createdAt:asc", "createdAt:desc", "name:asc", "name:desc"].includes(
        sort,
      )
    )
      sort = "createdAt:asc";
  }
  async function load() {
    if (!state.activeBoardId || state.viewMode !== "group") return;
    if (boardId !== state.activeBoardId) reset(state.activeBoardId);
    const currentBoardId = boardId,
      request = ++generation;
    const [key, order] = sort.split(":");
    const isCurrent = () => request === generation && currentBoardId === state.activeBoardId && state.viewMode === "group";
    const ticketUrl = `/api/boards/${currentBoardId}/group-tickets`;
    const loadTickets = async (/** @type {string} */ url) => {
      const { tickets: rows } = await collectTicketPages(ctx.api, url, { order: "id_asc", isCurrent, followPageLimit: true });
      return /** @type {GroupTicket[]} */ (/** @type {unknown} */ (rows));
    };
    try {
      const [list, ungroupedPage] = await Promise.all([
        ctx.api(`/api/boards/${currentBoardId}/groups?status=all&sort=${key}&order=${order}`),
        ctx.api(`${ticketUrl}?limit=1`),
      ]);
      if (!isCurrent()) return;
      const nextGroups = /** @type {{groups: GroupSummary[]}} */ (list).groups;
      let nextUngroupedCount = readTicketPage(ungroupedPage).page.total;
      const firstGroupId = nextGroups.find((group) => all || group.isActive)?.id ?? null;
      let nextSelectedId = selectedId;
      const selectionExists = nextSelectedId === "ungrouped"
        ? nextUngroupedCount > 0
        : nextGroups.some((group) => group.id === nextSelectedId);
      if (
        !selectionExists &&
        !renaming &&
        !descriptionEditing &&
        !adding
      )
        nextSelectedId = firstGroupId ?? (nextUngroupedCount ? "ungrouped" : null);
      /** @type {GroupTicket[]} */ let nextTickets = [];
      /** @type {GroupView | null} */ let nextSelected = null;
      if (nextSelectedId === "ungrouped") {
        const rows = await loadTickets(ticketUrl);
        if (!isCurrent()) return;
        nextTickets = rows;
        nextUngroupedCount = nextTickets.length;
        if (!nextUngroupedCount) nextSelectedId = firstGroupId;
      }
      if (typeof nextSelectedId === "number") {
        const [detail, rows] = await Promise.all([
          ctx.api(`/api/groups/${nextSelectedId}`),
          // Group renders its own priority/parent order. Fetch by the indexed ID
          // cursor instead of repeatedly sorting all remaining lane positions.
          loadTickets(`${ticketUrl}?groupId=${nextSelectedId}`),
        ]);
        if (!isCurrent()) return;
        nextSelected = /** @type {GroupView} */ (detail);
        nextTickets = rows;
      }
      if (loadedSelection !== nextSelectedId) showArchived = false;
      groups = nextGroups;
      ungroupedTicketCount = nextUngroupedCount;
      selectedId = loadedSelection = nextSelectedId;
      selected = nextSelected;
      receiveTickets(nextTickets);
      render();
    } catch (e) {
      if (isCurrent()) {
        error = e instanceof Error ? e.message : String(e);
        render();
      }
    }
  }
  function renderGroupBoard() {
    if (boardId !== state.activeBoardId) reset(state.activeBoardId);
    render();
    return load();
  }
  /** @param {number} id */
  async function openGroup(id) {
    const group = /** @type {GroupView} */ (await ctx.api(`/api/groups/${id}`));
    ctx.closeEditor?.();
    state.activeBoardId = group.boardId;
    if (boardId !== group.boardId) reset(group.boardId);
    selectedId = group.id;
    all = !group.isActive || all;
    adding = false;
    descriptionEditing = false;
    renaming = false;
    state.viewMode = "group";
    ctx.saveBoardViewMode?.();
    ctx.syncViewMode();
    ctx.syncBoardUrl();
    await ctx.refreshBoardDetail({ awaitGroupLoad: true });
  }
  /** @param {number} id @param {GroupTicket[]} [source] */
  const related = (id, source = tickets) => relatedTickets(id, source);
  function toolbar() {
    return /** @type {HTMLElement | null} */ (sections?.header.querySelector(".group-ticket-toolbar") ?? null);
  }

  /** @param {HTMLElement} header @param {string} html */
  function updateSearchHeader(header, html) {
    const current = toolbar();
    const template = document.createElement("template");
    template.innerHTML = html;
    const next = template.content.querySelector(".group-ticket-toolbar");
    const incoming = Array.from(template.content.childNodes);
    const split = next ? incoming.indexOf(next) : -1;
    if (current?.parentElement !== header || split < 0 || !next) {
      header.innerHTML = html;
      return;
    }
    // Keep the search input connected while SSE updates the surrounding title and counters.
    for (const node of Array.from(header.childNodes)) {
      if (node !== current) node.remove();
    }
    header.insertBefore(collect(incoming.slice(0, split)), current);
    header.append(collect(incoming.slice(split + 1)));
    const oldActions = [...current.children].filter(child => !child.matches(".group-window-search"));
    const newActions = [...next.children];
    if (oldActions.map(node => node.outerHTML).join("") !== newActions.map(node => node.outerHTML).join("")) {
      for (const action of oldActions) action.remove();
      current.prepend(...newActions);
    }
  }

  /** @param {ChildNode[]} nodes */
  function collect(nodes) {
    const fragment = document.createDocumentFragment();
    fragment.append(...nodes);
    return fragment;
  }

  function captureTicketAnchor() {
    return ticketWindow?.capture() ?? null;
  }

  /** @param {import("./app-group-types.js").GroupTicketAnchor} anchor */
  function restoreTicketAnchor(anchor) {
    if (ticketWindow) ticketWindow.restore(anchor);
    else if (sections) restoreGroupTicketAnchor(host, sections.tickets, anchor);
  }

  /** @param {Element | null} active */
  function captureTicketFocus(active) {
    if (ticketWindow) return ticketWindow.captureFocus();
    if (!sections || !(active instanceof HTMLButtonElement) || !sections.tickets.contains(active)) return null;
    const row = active.closest("[data-group-row-id]");
    if (!row) return null;
    const index = Array.from(sections.tickets.querySelectorAll("[data-group-row-id]")).indexOf(row);
    return { id: Number(row.getAttribute("data-group-row-id")), index, remove: active.hasAttribute("data-group-remove") };
  }

  /** @param {import("./app-group-types.js").GroupTicketFocus} origin @param {boolean} [reveal] */
  function restoreTicketFocus(origin, reveal = false) {
    if (ticketWindow) return ticketWindow.focus(origin, reveal);
    if (!sections) return false;
    const attribute = origin.remove ? "data-group-remove" : "data-group-ticket";
    const section = sections.tickets;
    const existing = section.querySelector(`[${attribute}="${origin.id}"]:not(:disabled)`);
    if (existing instanceof HTMLButtonElement) {
      existing.focus({ preventScroll: true });
      return true;
    }
    const rows = Array.from(section.querySelectorAll("[data-group-row-id]"));
    const index = Math.max(0, Math.min(origin.index, rows.length - 1));
    for (const row of [...rows.slice(index), ...rows.slice(0, index).reverse()]) {
      const candidate = row.querySelector("button:not(:disabled)");
      if (!(candidate instanceof HTMLButtonElement)) continue;
      candidate.focus();
      return true;
    }
    return false;
  }

  /** @param {number} id @param {import("./app-group-types.js").GroupTicketAnchor | null} anchor */
  function focusEditorTicket(id, anchor) {
    if (!ticketWindow && !anchor) return false;
    return restoreTicketFocus({ id, index: anchor?.index ?? 0, remove: false }, true);
  }

  function render() {
    ctx.beforeGroupRender?.();
    // Live board events must not interrupt a draft or move the caret while typing.
    const active = document.activeElement;
    const focused =
      host.contains(active) &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLButtonElement)
        ? active
        : null;
    const focusedForm = focused?.closest("form")?.dataset.groupForm;
    const action = focused?.dataset.groupAction;
    const focusedRemovedUngrouped = !ungroupedTicketCount && focused && (
      focused.dataset.selectGroup === "ungrouped" ||
      (!!host.querySelector('[data-select-group="ungrouped"][aria-current="true"]') &&
        focused.closest(".group-content-panel"))
    );
    /** @type {Record<string, string>} */
    const returnActions = {
      "cancel-create": "create",
      "cancel-rename": "rename",
      "cancel-description": "edit-description",
      "cancel-add": "add",
    };
    const returningAction = returnActions[action || ""];
    const submittedForm = focused?.type === "submit" ? focusedForm : null;
    /** @type {Record<string, string>} */
    const submitActions = {
      create: "rename",
      rename: "rename",
      description: "edit-description",
      members: "add",
    };
    const afterSubmitAction = submitActions[submittedForm || ""];
    const focusSelector = focused?.dataset.selectGroup
      ? `[data-select-group="${CSS.escape(focused.dataset.selectGroup)}"]`
      : focused?.id
      ? `#${focused.id}`
      : focused?.name && focusedForm
        ? `[data-group-form="${focusedForm}"] [name="${focused.name}"]`
        : action
          ? `[data-group-action="${returningAction || action}"]`
          : submittedForm
            ? `[data-group-form="${submittedForm}"] button[type="submit"]`
            : null;
    /** @type {[number | null, number | null] | null} */
    const selection =
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement
        ? [focused.selectionStart, focused.selectionEnd]
        : null;
    if (!boardId) {
      ticketSearch?.dispose();
      ticketSearch = null;
      ticketWindow?.dispose();
      ticketWindow = null;
      renderedViewScope = "";
      host.innerHTML = "";
      sections = null;
      sectionHtml = {};
      renderedTicketKey = "";
      return;
    }
    if (!sections || !host.contains(sections.tickets)) {
      ticketSearch?.dispose();
      ticketSearch = null;
      ticketWindow?.dispose();
      ticketWindow = null;
      renderedViewScope = "";
      host.innerHTML = '<div class="group-render-section" data-group-section="list"></div><div class="group-content-panel"><div class="group-render-section" data-group-section="header"></div><div class="group-render-section" data-group-section="tickets"></div><div class="group-render-section" data-group-section="footer"></div></div>';
      sections = {};
      for (const name of ["list", "header", "tickets", "footer"]) {
        sections[name] = /** @type {HTMLElement} */ (host.querySelector(`[data-group-section="${name}"]`));
      }
      sectionHtml = {};
      renderedTicketKey = "";
    }
    const lanes = state.boardDetail?.lanes ?? [];
    const ticketKey = JSON.stringify([
      boardId, loadedSelection, ticketRevision, showArchived, getLocale(), !!groups.length,
      lanes.map((lane) => [lane.id, lane.name]),
    ]);
    const updateTickets = ticketKey !== renderedTicketKey;
    const viewScope = JSON.stringify([boardId, loadedSelection]);
    const sameView = renderedViewScope === viewScope;
    const previousSearch = ticketSearch;
    const searchFocus = sameView ? previousSearch?.captureFocus() ?? null : null;
    const html = renderGroupViewSections(
      {
        groups,
        selectedId: loadedSelection,
        selected,
        ungroupedTicketCount,
        tickets,
        all,
        sort,
        showArchived,
        creating,
        createName,
        renaming,
        renameName,
        descriptionEditing,
        descriptionDraft,
        descriptionPreview,
        expanded,
        adding,
        busy,
        error,
        candidates,
        chosen,
        query,
        activeOption,
      },
      { escapeHtml: esc, lanes, rowIcon: (name) => getRowIcon()(name) },
      updateTickets ? "auto" : false,
    );
    const handoffFocus = updateTickets && sameView && (ticketWindow || html.ticketWindow)
      ? captureTicketFocus(active) : null;
    const anchor = updateTickets && sameView && (ticketWindow || html.ticketWindow)
      ? ticketWindow?.capture() ?? captureGroupTicketAnchor(host, sections.tickets)
      : null;
    for (const name of ["list", "header", "footer"]) {
      const value = html[/** @type {"list" | "header" | "footer"} */ (name)];
      if (sectionHtml[name] === value) continue;
      if (name === "header" && sameView && ticketSearch) updateSearchHeader(sections[name], value);
      else sections[name].innerHTML = value;
      sectionHtml[name] = value;
    }
    if (updateTickets) {
      const hadWindow = !!ticketWindow;
      if (html.ticketWindow) {
        if (ticketWindow && sameView) {
          ticketWindow.update(html.ticketWindow, anchor);
          ticketSearch?.update(html.ticketWindow.rows);
        } else {
          ticketSearch?.dispose();
          ticketWindow?.dispose();
          ticketWindow = createGroupTicketWindow(host, sections.tickets, html.ticketWindow);
          const windowView = ticketWindow;
          ticketSearch = createGroupWindowSearch({
            rows: html.ticketWindow.rows,
            capture: windowView.capture,
            restore: windowView.restore,
            reveal: windowView.reveal,
            focus: windowView.focus,
            highlight: windowView.highlight,
            open(id) {
              const node = windowView.reveal(id, toolbar()?.getBoundingClientRect().height);
              const title = node?.querySelector("[data-group-ticket]");
              if (title instanceof HTMLButtonElement) {
                title.focus({ preventScroll: true });
                title.click();
              }
            },
          });
          if (!sameView) host.scrollTop = 0;
          ticketWindow.restore(anchor);
        }
        ticketWindow.setBusy(busy);
      } else {
        ticketSearch?.dispose();
        ticketSearch = null;
        ticketWindow?.dispose();
        ticketWindow = null;
        sections.tickets.innerHTML = html.tickets ?? "";
        if (anchor) restoreGroupTicketAnchor(host, sections.tickets, anchor);
        else if (hadWindow && !sameView) host.scrollTop = 0;
      }
      renderedViewScope = viewScope;
      renderedTicketKey = ticketKey;
      renderedBusy = busy;
    } else {
      syncTicketBusy();
    }
    ticketSearch?.attach(toolbar());
    if (searchFocus && previousSearch === ticketSearch) ticketSearch?.restoreFocus(searchFocus);
    else if (searchFocus && !ticketSearch && document.activeElement === document.body) {
      const create = host.querySelector('[data-group-action="new-ticket"]');
      if (create instanceof HTMLButtonElement) create.focus({ preventScroll: true });
    }
    if (handoffFocus && document.activeElement === document.body) restoreTicketFocus(handoffFocus);
    if (focusSelector || focusedRemovedUngrouped) {
      const next = focusedRemovedUngrouped
        ? host.querySelector('[data-select-group][aria-current="true"]') || host.querySelector('[data-group-action="create"]')
        : (focusSelector && host.querySelector(focusSelector)) ||
        (afterSubmitAction
          ? host.querySelector(`[data-group-action="${afterSubmitAction}"]`)
          : null);
      if (next instanceof HTMLElement) next.focus({ preventScroll: true });
      if (
        selection &&
        (next instanceof HTMLInputElement ||
          next instanceof HTMLTextAreaElement)
      )
        next.setSelectionRange(...selection);
    }
    ctx.afterGroupRender?.();
  }
  /** @param {number} id */
  async function remove(id) {
    const group = selected;
    if (!group) return;
    const targetBoardId = boardId;
    const request = { ticketIds: [id], groupId: null };
    const origin = ticketWindow?.captureFocus();
    const restoreOrigin = () => {
      if (origin && state.activeBoardId === targetBoardId && loadedSelection === group.id && state.viewMode === "group") {
        restoreTicketFocus(origin, true);
      }
    };
    try {
      const preview = /** @type {GroupPreview} */ (
        await ctx.sendJson(`/api/boards/${boardId}/group-memberships/preview`, {
          method: "POST",
          body: request,
        })
      );
      const confirmed = await ctx.openFormDialog({
        title: tr("Remove from Group?"),
        message: tr("Remove {count} ticket(s) from “{name}”? Parent/child relationships and ticket status stay unchanged.", { count: preview.tickets.length, name: group.name }),
        fields: `<ul class="group-impact-list">${preview.tickets.map((t) => `<li>#${t.id} ${esc(t.title)}${t.isArchived ? ` <span class="muted">${tr("Archived")}</span>` : ""}</li>`).join("")}</ul>`,
        submitLabel: tr("Remove from Group"),
      });
      if (!confirmed) {
        restoreOrigin();
        return;
      }
      await ctx.sendJson(`/api/boards/${boardId}/group-memberships`, {
        method: "PUT",
        body: { ...request, expectedToken: preview.expectedToken },
      });
      await ctx.refreshBoardDetail();
      focusMembershipAction(targetBoardId, group.id);
    } catch (error) {
      restoreOrigin();
      throw error;
    }
  }
  /** @param {HTMLButtonElement} button */
  async function act(button) {
    if (busy) return;
    error = "";
    if (button.dataset.groupSortKey) {
      const key = button.dataset.groupSortKey;
      const value = sort;
      const [current, direction] = value.split(":");
      const next = `${key}:${current === key && direction === "asc" ? "desc" : "asc"}`;
      sort = next;
      try {
        localStorage.setItem(sortKey(), sort);
      } catch {}
      await load();
      return;
    }
    if (button.dataset.selectGroup) {
      selectedId = button.dataset.selectGroup === "ungrouped" ? "ungrouped" : Number(button.dataset.selectGroup);
      adding = false;
      renaming = false;
      descriptionEditing = false;
      showArchived = false;
      expanded = false;
      await load();
      return;
    }
    if (button.dataset.groupTicket) {
      await ctx.openEditor(Number(button.dataset.groupTicket), "view");
      return;
    }
    if (button.dataset.groupRemove) {
      await remove(Number(button.dataset.groupRemove));
      return;
    }
    if (button.dataset.groupPick) {
      const id = related(Number(button.dataset.groupPick), candidates)[0]?.id;
      if (id && !chosen.includes(id)) chosen.push(id);
      query = "";
      render();
      focus("#group-ticket-search");
      return;
    }
    if (button.dataset.groupUnpick) {
      chosen = chosen.filter((id) => id !== Number(button.dataset.groupUnpick));
      render();
      focus("#group-ticket-search");
      return;
    }
    switch (button.dataset.groupAction) {
      case "active":
        all = false;
        if (selectedId !== "ungrouped" && !groups.find((g) => g.id === selectedId)?.isActive)
          selectedId = null;
        await load();
        return;
      case "all":
        all = true;
        await load();
        return;
      case "create":
        creating = true;
        createName = "";
        render();
        focus('[data-group-form="create"] input');
        return;
      case "cancel-create":
        creating = false;
        break;
      case "rename":
        if (!selected) return;
        renaming = true;
        renameTarget = { id: selected.id, revision: selected.revision };
        renameName = selected.name;
        render();
        focus('[data-group-form="rename"] input');
        return;
      case "cancel-rename":
        renaming = false;
        break;
      case "edit-description":
        if (!selected) return;
        descriptionEditing = true;
        descriptionTarget = { id: selected.id, revision: selected.revision };
        descriptionDraft = selected.descriptionMarkdown || "";
        descriptionPreview = null;
        render();
        focus("textarea");
        return;
      case "cancel-description":
        descriptionEditing = false;
        break;
      case "preview-description": {
        const result = /** @type {{bodyHtml: string}} */ (
          await ctx.sendJson("/api/markdown/preview", {
            method: "POST",
            body: { bodyMarkdown: descriptionDraft },
          })
        );
        descriptionPreview = result.bodyHtml;
        break;
      }
      case "expand-description":
        expanded = !expanded;
        break;
      case "archive":
        showArchived = !showArchived;
        break;
      case "add": {
        if (!selected) return;
        if (adding) {
          focus("#group-ticket-search");
          return;
        }
        const targetGroupId = selected.id;
        const targetBoardId = boardId;
        const isCurrent = () => state.viewMode === "group" && state.activeBoardId === targetBoardId
          && selectedId === targetGroupId && loadedSelection === targetGroupId;
        /** @type {{tickets: GroupTicket[]}} */ let rows;
        try {
          rows = /** @type {{tickets: GroupTicket[]}} */ (await ctx.api(
            `/api/boards/${targetBoardId}/tickets?ungrouped=true&archived=all`,
          ));
        } catch (error) {
          if (isCurrent()) throw error;
          return;
        }
        if (!isCurrent()) return;
        addGroupId = targetGroupId;
        candidates = rows.tickets;
        chosen = [];
        query = "";
        adding = true;
        render();
        focus("#group-ticket-search");
        return;
      }
      case "cancel-add":
        adding = false;
        break;
      case "new-ticket":
        if (selected) {
          await ctx.openEditor(null, "edit", null, { id: selected.id, name: selected.name });
        } else if (loadedSelection === "ungrouped") {
          await ctx.openEditor(null, "edit", null);
        }
        return;
      case "delete":
        if (!selected) return;
        {
          const deleting = { ...selected };
          await ctx.confirmAndRun({
            title: tr("Delete Group"),
            message: tr("Delete Group “{name}”?", { name: deleting.name }),
            warning: tr("This action cannot be undone."),
            submitLabel: tr("Delete"),
            run: async () => {
              await ctx.api(`/api/groups/${deleting.id}`, {
                method: "DELETE",
                headers: { "If-Match": `"${deleting.revision}"` },
              });
              selectedId = null;
              await load();
            },
          });
          return;
        }
      default:
        return;
    }
    render();
  }
  host.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const button = e.target.closest("button");
    if (button && !(button.type === "submit" && button.closest("form")))
      void act(button).catch((e) => {
        error = e instanceof Error ? e.message : String(e);
        render();
      });
  });
  host.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form),
      kind = form.dataset.groupForm;
    const targetBoardId = boardId;
    const targetGroupId = addGroupId;
    let membershipSaved = false;
    busy = true;
    // Submission temporarily changes the DOM outside the render cache. Ensure
    // success/failure restores the form's computed submit-button state.
    delete sectionHtml[kind === "create" ? "list" : "header"];
    syncTicketBusy();
    error = "";
    form.querySelectorAll('button[type="submit"]').forEach((b) => {
      if (b instanceof HTMLButtonElement) b.disabled = true;
    });
    try {
      if (kind === "create") {
        const group = /** @type {GroupView} */ (
          await ctx.sendJson(`/api/boards/${boardId}/groups`, {
            method: "POST",
            body: { name: String(data.get("name")).trim() },
          })
        );
        selectedId = group.id;
        creating = false;
      } else if (kind === "rename" || kind === "description") {
        const target = kind === "rename" ? renameTarget : descriptionTarget;
        if (!target) return;
        await ctx.sendJson(`/api/groups/${target.id}`, {
          method: "PATCH",
          body: {
            ...(kind === "rename"
              ? { name: String(data.get("name")).trim() }
              : { descriptionMarkdown: descriptionDraft }),
            expectedRevision: target.revision,
          },
        });
        if (kind === "rename") renaming = false;
        else descriptionEditing = false;
      } else if (kind === "members") {
        const request = { ticketIds: chosen, groupId: addGroupId };
        const preview = /** @type {GroupPreview} */ (
          await ctx.sendJson(
            `/api/boards/${boardId}/group-memberships/preview`,
            { method: "POST", body: request },
          )
        );
        const expectedIds = chosen
          .flatMap((id) => related(id, candidates))
          .map((t) => t.id)
          .sort((a, b) => a - b);
        if (
          JSON.stringify([...new Set(expectedIds)]) !==
          JSON.stringify(preview.tickets.map((t) => t.id).sort((a, b) => a - b))
        )
          throw new Error(
            tr("Parent/child tickets changed. Cancel and search again before adding."),
          );
        await ctx.sendJson(`/api/boards/${boardId}/group-memberships`, {
          method: "PUT",
          body: { ...request, expectedToken: preview.expectedToken },
        });
        adding = false;
        membershipSaved = true;
      }
      await ctx.refreshBoardDetail({ awaitGroupLoad: true });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      render();
      if (membershipSaved) focusMembershipAction(targetBoardId, targetGroupId);
    }
  });
  host.addEventListener("input", (e) => {
    if (
      !(
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
    )
      return;
    if (e.target.name === "description") descriptionDraft = e.target.value;
    if (e.target.name === "name") {
      if (e.target.closest('[data-group-form="create"]'))
        createName = e.target.value;
      else renameName = e.target.value;
    }
    if (e.target instanceof HTMLInputElement && e.target.id === "group-ticket-search") {
      query = e.target.value;
      activeOption = 0;
      renderOptions(e.target);
    }
  });
  host.addEventListener("keydown", (e) => {
    if (
      !(e.target instanceof HTMLInputElement) ||
      e.target.id !== "group-ticket-search"
    )
      return;
    if (e.key === "Escape") {
      activeOption = 0;
      query = "";
      e.target.value = "";
      renderOptions(e.target);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
    e.preventDefault();
    // The rendered options already reflect the current query and chosen families.
    const options = host.querySelector("#group-ticket-options");
    if (!(options?.firstElementChild instanceof HTMLButtonElement)) return;
    const buttons = options.children;
    if (e.key === "Enter") {
      const option = buttons[activeOption];
      if (option instanceof HTMLButtonElement) option.click();
      return;
    }
    const previous = buttons[activeOption];
    const direction = e.key === "ArrowDown" ? 1 : -1;
    activeOption = (activeOption + direction + buttons.length) % buttons.length;
    const next = buttons[activeOption];
    if (previous !== next) {
      previous?.setAttribute("aria-selected", "false");
      next.setAttribute("aria-selected", "true");
    }
    e.target.setAttribute("aria-activedescendant", next.id);
  });
  /** @param {number} id */
  const isActiveGroup = (id) => state.viewMode === "group" && boardId === state.activeBoardId && selectedId === id;
  return { renderGroupBoard, openGroup, isActiveGroup, captureTicketAnchor, restoreTicketAnchor, focusEditorTicket };
}
