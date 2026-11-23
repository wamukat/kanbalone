import { t } from "./app-i18n.js";

// Navigate the existing title buttons, independently of List bulk selection.
export function createBoardKeyboardModule(ctx, listModule, {
  onKanbanKeyboardScroll, findKanbanTitle, firstKanbanTitle, kanbanNeighbor,
  captureKanbanAnchor, restoreKanbanAnchor,
  captureGroupAnchor, restoreGroupAnchor, focusGroupEditorTicket,
} = {}) {
  const { state, elements } = ctx;
  let creationOpening = false;
  let returnTarget = null;
  let originVersion = 0;
  let repaintTarget = null;
  let editorReturnPending = false;
  let searchPending = false;
  const selector = ".list-ticket-link[data-open-ticket-id], .ticket-card .ticket-link";
  const visible = (element) => element instanceof HTMLElement && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0;
  const isBoardTitle = (element) => element instanceof HTMLElement && element.matches(selector)
    && (elements.listBoard.contains(element) || elements.laneBoard.contains(element));
  const identity = (element) => Number(element.dataset.openTicketId || element.closest(".ticket-card")?.dataset.ticketId);
  const selectedGroup = () => elements.groupBoard.querySelector('[data-select-group][aria-current="true"]');
  const context = () => ({ boardId: state.activeBoardId, view: state.viewMode,
    groupId: state.viewMode === "group" ? selectedGroup()?.dataset.selectGroup : null });
  const sameContext = (target) => target?.boardId === state.activeBoardId && target.view === state.viewMode
    && (target.view !== "group" || target.groupId === selectedGroup()?.dataset.selectGroup);

  function describeOrigin(element) {
    if (!(element instanceof HTMLElement) || !visible(element)) return null;
    if (isBoardTitle(element)) return { id: identity(element) };
    if (elements.groupBoard.contains(element)) {
      if (element.matches('[data-group-ticket]')) return { groupTicketId: Number(element.dataset.groupTicket), query: `[data-group-ticket="${Number(element.dataset.groupTicket)}"]` };
      if (element.matches('[data-select-group][aria-current="true"]')) return { query: `[data-select-group="${CSS.escape(element.dataset.selectGroup)}"]` };
      if (element.matches('[data-group-action="new-ticket"]')) return { query: '[data-group-action="new-ticket"]' };
    }
    if (elements.laneBoard.contains(element) && element.matches('.add-ticket-button')) {
      return { query: `.lane[data-lane-id="${Number(element.closest('.lane')?.dataset.laneId)}"] .add-ticket-button` };
    }
    if (elements.listBoard.contains(element) && element.matches('[data-empty-create-ticket]')) return { query: '[data-empty-create-ticket]' };
    return null;
  }

  function focusOrigin(target) {
    if (target.view === "group" && target.groupTicketId != null && focusGroupEditorTicket?.(target.groupTicketId, target.scroll.groupAnchor)) return true;
    if (target.id != null) return focusTitle(target.id, false);
    const host = target.view === 'group' ? elements.groupBoard : target.view === 'list' ? elements.listBoard : elements.laneBoard;
    const element = host.querySelector(target.query);
    if (!visible(element)) return false;
    element.focus({ preventScroll: true });
    return true;
  }

  function focusFallback() {
    const target = state.viewMode === 'group'
      ? elements.groupBoard.querySelector('[data-group-action="new-ticket"]') || selectedGroup()
      : elements.searchInput;
    if (visible(target)) target.focus({ preventScroll: true });
  }

  async function createFromOrigin(element) {
    if (creationOpening || !state.boardNavigationReady || !state.boardDetail?.lanes.length) return;
    const laneId = state.viewMode === 'kanban' ? Number(element.closest('.lane')?.dataset.laneId) : null;
    const group = state.viewMode === 'group' ? selectedGroup() : null;
    if (state.viewMode === 'group' && !group) return;
    const groupSelection = group?.dataset.selectGroup;
    const groupContext = groupSelection && groupSelection !== "ungrouped"
      ? { id: Number(groupSelection), name: group.querySelector(".group-choice-name")?.textContent ?? "" }
      : null;
    creationOpening = true;
    try {
      await ctx.openEditor(null, 'edit', laneId, groupContext);
    } catch (error) { ctx.showToast(error.message, 'error'); }
    finally { creationOpening = false; }
  }

  function scrollSnapshot() {
    return {
      windowX: window.scrollX, windowY: window.scrollY,
      groupLeft: elements.groupBoard.scrollLeft, groupTop: elements.groupBoard.scrollTop,
      groupAnchor: state.viewMode === "group" ? captureGroupAnchor?.() : null,
      boardLeft: elements.laneBoard.scrollLeft,
      boardTop: elements.laneBoard.scrollTop,
      listLeft: elements.listBoard.scrollLeft,
      listTop: elements.listBoard.querySelector(".list-viewport")?.scrollTop ?? 0,
      lanes: [...elements.laneBoard.querySelectorAll(".ticket-list[data-lane-id]")]
        .map((list) => [list.dataset.laneId, list.scrollTop, captureKanbanAnchor?.(list)]),
    };
  }

  function restoreScroll(scroll) {
    window.scrollTo(scroll.windowX, scroll.windowY);
    elements.groupBoard.scrollLeft = scroll.groupLeft;
    if (state.viewMode === "group" && scroll.groupAnchor && restoreGroupAnchor) restoreGroupAnchor(scroll.groupAnchor);
    else elements.groupBoard.scrollTop = scroll.groupTop;
    elements.laneBoard.scrollLeft = scroll.boardLeft;
    elements.laneBoard.scrollTop = scroll.boardTop;
    elements.listBoard.scrollLeft = scroll.listLeft;
    const viewport = elements.listBoard.querySelector(".list-viewport");
    if (viewport) viewport.scrollTop = scroll.listTop;
    for (const [id, top, anchor] of scroll.lanes) {
      const list = elements.laneBoard.querySelector(`.ticket-list[data-lane-id="${id}"]`);
      if (list && !restoreKanbanAnchor?.(list, anchor)) list.scrollTop = top;
    }
  }

  function kanbanButtons(container) {
    return [...container.querySelectorAll(".ticket-card .ticket-link")].filter(visible);
  }

  function focusTitle(id, scroll = true) {
    if (state.viewMode === "list") return listModule.focusTicket(id, { scroll });
    const title = findKanbanTitle?.(id, scroll) ?? elements.laneBoard.querySelector(`.ticket-card[data-ticket-id="${id}"] .ticket-link`);
    return visible(title) && focusKanbanTitle(title, scroll);
  }

  function focusKanbanTitle(title, scroll = true) {
    title.focus({ preventScroll: true });
    if (scroll) {
      const card = title.closest(".ticket-card");
      const list = card.closest(".ticket-list");
      onKanbanKeyboardScroll?.(list);
      const rect = card.getBoundingClientRect();
      const viewport = list.getBoundingClientRect();
      if (rect.top < viewport.top + 4) list.scrollTop -= viewport.top + 4 - rect.top;
      else if (rect.bottom > viewport.bottom - 4) list.scrollTop += rect.bottom - viewport.bottom + 4;
      const lane = card.closest(".lane").getBoundingClientRect();
      const board = elements.laneBoard.getBoundingClientRect();
      if (lane.left < board.left) elements.laneBoard.scrollLeft -= board.left - lane.left;
      else if (lane.right > board.right) elements.laneBoard.scrollLeft += lane.right - board.right;
    }
    return true;
  }

  function captureEditorOrigin() {
    // Relation links inside a detail keep the original board return location.
    if (elements.editorDialog.open) return originVersion;
    originVersion += 1;
    const active = document.activeElement;
    const origin = describeOrigin(active);
    returnTarget = origin
      ? { ...context(), ...origin, scroll: scrollSnapshot() }
      : null;
    return originVersion;
  }

  function restoreEditorOrigin(version) {
    if (version !== originVersion || !returnTarget || !sameContext(returnTarget)) return false;
    editorReturnPending = true;
    restorePendingOrigin();
    // The target may still be in a pending Kanban render batch. Do not replace
    // its deferred restoration with the generic editor-action fallback.
    return true;
  }

  function restorePendingOrigin() {
    // A newer detail may have opened while the previous close awaited a refresh.
    if (elements.editorDialog.open || elements.uxDialog.open) {
      editorReturnPending = false;
      return;
    }
    if (!returnTarget || !sameContext(returnTarget)) {
      returnTarget = null;
      editorReturnPending = false;
      return;
    }
    const target = returnTarget;
    // A user who already moved elsewhere while a refresh was pending keeps control.
    const active = document.activeElement;
    const current = active === document.body && sameContext(repaintTarget) ? repaintTarget : describeOrigin(active);
    const moved = current && (current.id !== target.id || current.query !== target.query);
    if (moved || (!current && active !== document.body && visible(active))) {
      returnTarget = null;
      editorReturnPending = false;
      return;
    }
    restoreScroll(target.scroll);
    if (focusOrigin(target)) {
      restoreScroll(target.scroll);
      returnTarget = null;
      editorReturnPending = false;
    } else if (!state.boardKeyboardRenderPending) {
      focusFallback();
      returnTarget = null;
      editorReturnPending = false;
    }
  }

  function beforeRender() {
    const active = document.activeElement;
    const origin = describeOrigin(active);
    if (origin && !elements.editorDialog.open) {
      repaintTarget = { ...context(), ...origin, scroll: scrollSnapshot() };
    }
  }

  function afterRender() {
    const help = state.viewMode === "kanban"
      ? t("Down: select a ticket. Up/Down: within a lane. Left/Right: between lanes. Enter: open. Escape: return.")
      : t("Down: select a ticket. Up/Down: previous or next ticket. Enter: open. Escape: return.");
    if (state.viewMode === "group") {
      elements.searchInput.removeAttribute("title");
      elements.searchInput.removeAttribute("aria-description");
    } else {
      elements.searchInput.title = help;
      elements.searchInput.setAttribute("aria-description", help);
    }
    if (elements.editorDialog.open || elements.uxDialog.open) return;
    if (!state.boardNavigationLoading && !state.boardNavigationReady) searchPending = false;
    if (editorReturnPending) restorePendingOrigin();
    if (searchPending && document.activeElement === elements.searchInput && !state.boardNavigationLoading) {
      if (focusFirst() || !state.boardKeyboardRenderPending) searchPending = false;
    }
    if (!repaintTarget) return;
    if (!sameContext(repaintTarget) || (document.activeElement !== document.body && visible(document.activeElement))) {
      repaintTarget = null;
      return;
    }
    if (focusOrigin(repaintTarget)) {
      restoreScroll(repaintTarget.scroll);
      repaintTarget = null;
    }
    else if (!state.boardKeyboardRenderPending) {
      repaintTarget = null;
      focusFallback();
    }
  }

  function focusFirst() {
    if (state.viewMode === "list") {
      const id = listModule.getOrderedTicketIds()[0];
      return id != null && Number.isFinite(id) && focusTitle(id);
    }
    const first = firstKanbanTitle?.();
    if (visible(first)) return focusKanbanTitle(first);
    const titles = elements.laneBoard.getElementsByClassName("ticket-link");
    // Index the live collection without reading its length before finding the first title.
    for (let index = 0; ; index += 1) {
      const title = titles.item(index);
      if (!title) return false;
      if (title.closest(".ticket-card") && visible(title)) return focusKanbanTitle(title);
    }
  }

  function focusSearch(event) {
    if (event.repeat || !state.activeBoardId) return;
    const source = event.target;
    if (source instanceof Element && (source.closest("input, textarea, select, [role='textbox'], [role='searchbox']")
        || (source instanceof HTMLElement && source.isContentEditable))) return;
    const search = state.viewMode === "group"
      ? elements.groupBoard.querySelector(".group-window-search input")
      : elements.searchInput;
    if (!(search instanceof HTMLInputElement) || search.disabled || !visible(search)) return;
    event.preventDefault();
    search.focus();
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || elements.editorDialog.open || elements.uxDialog.open) return;
    if (event.key === "/") {
      focusSearch(event);
      return;
    }
    if (!event.repeat && event.key.toLowerCase() === 'n' && event.target === document.activeElement && describeOrigin(event.target)) {
      event.preventDefault();
      void createFromOrigin(event.target);
      return;
    }
    if (!["list", "kanban"].includes(state.viewMode)) return;
    if (event.target === elements.searchInput && event.key === "ArrowDown") {
      event.preventDefault();
      if (state.boardNavigationLoading) searchPending = true;
      else if (state.boardNavigationReady && !focusFirst() && state.boardKeyboardRenderPending) searchPending = true;
      return;
    }
    if (!isBoardTitle(event.target)) return;
    if (!state.boardNavigationReady && event.key !== "Escape") {
      if (["Enter", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
      return;
    }
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      elements.searchInput.focus({ preventScroll: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if (state.viewMode === "list" && !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const title = event.target;
    if (state.viewMode === "list") {
      const ids = listModule.getOrderedTicketIds();
      const index = ids.indexOf(identity(title));
      const next = index + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0) elements.searchInput.focus({ preventScroll: true });
      else if (next < ids.length) focusTitle(ids[next]);
      return;
    }
    const list = title.closest(".ticket-list");
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const logicalNeighbor = kanbanNeighbor?.(list, identity(title), direction);
      if (logicalNeighbor != null) {
        focusTitle(logicalNeighbor);
        return;
      }
      if (logicalNeighbor === null && direction < 0) {
        elements.searchInput.focus({ preventScroll: true });
        return;
      }
      const titles = kanbanButtons(list);
      const next = titles.indexOf(title) + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0) elements.searchInput.focus({ preventScroll: true });
      else if (next < titles.length) focusKanbanTitle(titles[next]);
      return;
    }
    const lists = [...elements.laneBoard.querySelectorAll(".ticket-list[data-lane-id]")];
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const rect = title.closest(".ticket-card").getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    for (let index = lists.indexOf(list) + direction; index >= 0 && index < lists.length; index += direction) {
      const titles = kanbanButtons(lists[index]);
      if (!titles.length) continue;
      const viewport = lists[index].getBoundingClientRect();
      const onscreen = titles.filter((button) => {
        const box = button.closest(".ticket-card").getBoundingClientRect();
        return box.bottom > viewport.top && box.top < viewport.bottom;
      });
      const candidates = onscreen.length ? onscreen : titles;
      const distance = (button) => {
        const box = button.closest(".ticket-card").getBoundingClientRect();
        return Math.abs(box.top + box.height / 2 - center);
      };
      const next = candidates.reduce((best, button) => distance(button) < distance(best) ? button : best);
      focusKanbanTitle(next);
      return;
    }
  }

  elements.searchInput.addEventListener("input", () => { searchPending = false; });
  function describeCreationShortcut(element) {
    if (!describeOrigin(element)) return;
    element.setAttribute('aria-keyshortcuts', 'n');
    element.setAttribute('aria-description', t('N: create a ticket.'));
    element.title = t('N: create a ticket.');
  }
  document.addEventListener("focusin", (event) => {
    if (event.target !== elements.searchInput) searchPending = false;
    describeCreationShortcut(event.target);
  });
  document.addEventListener('mouseover', (event) => {
    describeCreationShortcut(event.target instanceof Element ? event.target.closest('button') : null);
  });
  document.addEventListener("keydown", handleKeydown);
  return { beforeRender, afterRender, captureEditorOrigin, restoreEditorOrigin };
}
