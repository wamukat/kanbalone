import { t } from "./app-i18n.js";

// Navigate the existing title buttons, independently of List bulk selection.
export function createBoardKeyboardModule({ state, elements }, listModule) {
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
  const context = () => ({ boardId: state.activeBoardId, view: state.viewMode });
  const sameContext = (target) => target?.boardId === state.activeBoardId && target.view === state.viewMode;

  function scrollSnapshot() {
    return {
      boardLeft: elements.laneBoard.scrollLeft,
      boardTop: elements.laneBoard.scrollTop,
      listLeft: elements.listBoard.scrollLeft,
      listTop: elements.listBoard.querySelector(".list-viewport")?.scrollTop ?? 0,
      lanes: [...elements.laneBoard.querySelectorAll(".ticket-list[data-lane-id]")]
        .map((list) => [list.dataset.laneId, list.scrollTop]),
    };
  }

  function restoreScroll(scroll) {
    elements.laneBoard.scrollLeft = scroll.boardLeft;
    elements.laneBoard.scrollTop = scroll.boardTop;
    elements.listBoard.scrollLeft = scroll.listLeft;
    const viewport = elements.listBoard.querySelector(".list-viewport");
    if (viewport) viewport.scrollTop = scroll.listTop;
    for (const [id, top] of scroll.lanes) {
      const list = elements.laneBoard.querySelector(`.ticket-list[data-lane-id="${id}"]`);
      if (list) list.scrollTop = top;
    }
  }

  function kanbanButtons(container = elements.laneBoard) {
    return [...container.querySelectorAll(".ticket-card .ticket-link")].filter(visible);
  }

  function focusTitle(id, scroll = true) {
    if (state.viewMode === "list") return listModule.focusTicket(id, { scroll });
    const title = kanbanButtons().find((button) => identity(button) === id);
    if (!title) return false;
    title.focus({ preventScroll: true });
    if (scroll) {
      const card = title.closest(".ticket-card");
      const list = card.closest(".ticket-list");
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
    returnTarget = isBoardTitle(active)
      ? { ...context(), id: identity(active), scroll: scrollSnapshot() }
      : null;
    return originVersion;
  }

  function restoreEditorOrigin(version) {
    if (version !== originVersion) return;
    editorReturnPending = true;
    restorePendingOrigin();
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
    if (active !== document.body && visible(active) && !isBoardTitle(active)) {
      returnTarget = null;
      editorReturnPending = false;
      return;
    }
    restoreScroll(target.scroll);
    if (focusTitle(target.id, false)) {
      restoreScroll(target.scroll);
      returnTarget = null;
      editorReturnPending = false;
    } else if (!state.boardKeyboardRenderPending) {
      elements.searchInput.focus({ preventScroll: true });
      returnTarget = null;
      editorReturnPending = false;
    }
  }

  function beforeRender() {
    const active = document.activeElement;
    if (isBoardTitle(active) && !elements.editorDialog.open) {
      repaintTarget = { ...context(), id: identity(active) };
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
    if (elements.editorDialog.open || elements.uxDialog.open || state.viewMode === "group") return;
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
    if (focusTitle(repaintTarget.id, false)) repaintTarget = null;
    else if (!state.boardKeyboardRenderPending) {
      repaintTarget = null;
      elements.searchInput.focus({ preventScroll: true });
    }
  }

  function focusFirst() {
    const id = state.viewMode === "list" ? listModule.getOrderedTicketIds()[0] : identity(kanbanButtons()[0] ?? document.createElement("button"));
    return id != null && Number.isFinite(id) ? focusTitle(id) : false;
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || elements.editorDialog.open || elements.uxDialog.open || !["list", "kanban"].includes(state.viewMode)) return;
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
      const titles = kanbanButtons(list);
      const next = titles.indexOf(title) + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0) elements.searchInput.focus({ preventScroll: true });
      else if (next < titles.length) focusTitle(identity(titles[next]));
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
      focusTitle(identity(next));
      return;
    }
  }

  elements.searchInput.addEventListener("input", () => { searchPending = false; });
  document.addEventListener("focusin", (event) => {
    if (event.target !== elements.searchInput) searchPending = false;
  });
  document.addEventListener("keydown", handleKeydown);
  return { beforeRender, afterRender, captureEditorOrigin, restoreEditorOrigin };
}
