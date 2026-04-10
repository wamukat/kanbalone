import { createBoardModule } from "./app-board.js";
import { createEditorModule } from "./app-editor.js";

const state = {
  boards: [],
  activeBoardId: null,
  boardDetail: null,
  boardTickets: [],
  boardEvents: null,
  boardEventsBoardId: null,
  boardRefreshInFlight: false,
  boardRefreshQueued: false,
  viewMode: "kanban",
  selectedListTicketIds: [],
  sidebarCollapsed: localStorage.getItem("soloboard:sidebar-collapsed") === "true",
  filters: {
    q: "",
    lane: "",
    completed: "",
    tag: "",
  },
  editingTicketId: null,
  activeLaneDragId: null,
  dialogMode: "view",
  skipDialogCloseSync: false,
  toastTimer: null,
  uxResolver: null,
  uxMode: "form",
  editorTagIds: [],
  editorBlockerIds: [],
  editorChildIds: [],
  editorOriginalChildIds: [],
  tagQuery: "",
  parentQuery: "",
  blockerQuery: "",
  childQuery: "",
};

const elements = {
  shell: document.querySelector(".shell"),
  sidebar: document.querySelector("#sidebar"),
  boardList: document.querySelector("#board-list"),
  sidebarTagSection: document.querySelector("#sidebar-tag-section"),
  sidebarTagList: document.querySelector("#sidebar-tag-list"),
  newSidebarTagButton: document.querySelector("#new-sidebar-tag-button"),
  sidebarBoardSection: document.querySelector("#sidebar-board-section"),
  renameBoardButton: document.querySelector("#rename-board-button"),
  deleteBoardButton: document.querySelector("#delete-board-button"),
  boardTitle: document.querySelector("#board-title"),
  laneBoard: document.querySelector("#lane-board"),
  listBoard: document.querySelector("#list-board"),
  sidebarToggleButton: document.querySelector("#sidebar-toggle-button"),
  sidebarReopenButton: document.querySelector("#sidebar-reopen-button"),
  newBoardButton: document.querySelector("#new-board-button"),
  searchInput: document.querySelector("#search-input"),
  laneFilter: document.querySelector("#lane-filter"),
  viewModeButtons: [...document.querySelectorAll("#view-mode-toggle button")],
  completedFilter: document.querySelector("#completed-filter"),
  completedFilterButtons: [...document.querySelectorAll("#completed-filter button")],
  tagFilter: document.querySelector("#tag-filter"),
  exportBoardButton: document.querySelector("#export-board-button"),
  importBoardInput: document.querySelector("#import-board-input"),
  editorDialog: document.querySelector("#editor-dialog"),
  editorHeaderState: document.querySelector("#editor-header-state"),
  editorHeaderId: document.querySelector("#editor-header-id"),
  headerEditButton: document.querySelector("#header-edit-button"),
  ticketView: document.querySelector("#ticket-view"),
  editorForm: document.querySelector("#editor-form"),
  editorTitle: document.querySelector("#editor-title"),
  ticketViewMeta: document.querySelector("#ticket-view-meta"),
  ticketRelations: document.querySelector("#ticket-relations"),
  ticketViewBody: document.querySelector("#ticket-view-body"),
  ticketComments: document.querySelector("#ticket-comments"),
  commentForm: document.querySelector("#comment-form"),
  commentBody: document.querySelector("#comment-body"),
  saveCommentButton: document.querySelector("#save-comment-button"),
  ticketTitle: document.querySelector("#ticket-title"),
  ticketLane: document.querySelector("#ticket-lane"),
  ticketParent: document.querySelector("#ticket-parent"),
  ticketParentToggle: document.querySelector("#ticket-parent-toggle"),
  ticketParentSummary: document.querySelector("#ticket-parent-summary"),
  ticketParentSearch: document.querySelector("#ticket-parent-search"),
  ticketParentOptions: document.querySelector("#ticket-parent-options"),
  ticketPriority: document.querySelector("#ticket-priority"),
  ticketCompleted: document.querySelector("#ticket-completed"),
  ticketNewTagButton: document.querySelector("#ticket-new-tag-button"),
  ticketTagToggle: document.querySelector("#ticket-tag-toggle"),
  ticketTagSummary: document.querySelector("#ticket-tag-summary"),
  ticketTagSearch: document.querySelector("#ticket-tag-search"),
  ticketTagOptions: document.querySelector("#ticket-tag-options"),
  ticketBlockerToggle: document.querySelector("#ticket-blocker-toggle"),
  ticketBlockerSummary: document.querySelector("#ticket-blocker-summary"),
  ticketBlockerSearch: document.querySelector("#ticket-blocker-search"),
  ticketBlockerOptions: document.querySelector("#ticket-blocker-options"),
  ticketChildrenRow: document.querySelector("#ticket-children-row"),
  ticketChildToggle: document.querySelector("#ticket-child-toggle"),
  ticketChildSummary: document.querySelector("#ticket-child-summary"),
  ticketChildSearch: document.querySelector("#ticket-child-search"),
  ticketChildOptions: document.querySelector("#ticket-child-options"),
  ticketBody: document.querySelector("#ticket-body"),
  deleteTicketButton: document.querySelector("#delete-ticket-button"),
  ticketCompletedRow: document.querySelector("#ticket-completed-row"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  uxDialog: document.querySelector("#ux-dialog"),
  uxForm: document.querySelector("#ux-form"),
  uxTitle: document.querySelector("#ux-title"),
  uxMessage: document.querySelector("#ux-message"),
  uxFields: document.querySelector("#ux-fields"),
  uxError: document.querySelector("#ux-error"),
  uxDangerButton: document.querySelector("#ux-danger-button"),
  uxSubmitButton: document.querySelector("#ux-submit-button"),
  uxDismissButton: document.querySelector("#ux-dismiss-button"),
  uxCancelButton: document.querySelector("#ux-cancel-button"),
  toast: document.querySelector("#toast"),
};

async function main() {
  bindEvents();
  syncSidebar();
  syncCompletedFilter("");
  syncViewMode();
  await refreshBoards();
  await applyRouteFromLocation({ replace: true });
}

function syncViewMode() {
  elements.viewModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
  });
  elements.laneBoard.hidden = state.viewMode !== "kanban";
  elements.listBoard.hidden = state.viewMode !== "list";
  elements.laneFilter.hidden = state.viewMode !== "list";
  syncListActionButtons();
}

function syncListActionButtons() {
  const disabled = state.selectedListTicketIds.length === 0;
  elements.listBoard.querySelectorAll(".list-action-button").forEach((button) => {
    button.disabled = disabled;
  });
}

function bindEvents() {
  elements.sidebarToggleButton.addEventListener("click", toggleSidebar);
  elements.sidebarReopenButton.addEventListener("click", toggleSidebar);
  elements.newBoardButton.addEventListener("click", createBoard);
  elements.newSidebarTagButton.addEventListener("click", createTag);
  elements.renameBoardButton.addEventListener("click", renameBoard);
  elements.deleteBoardButton.addEventListener("click", deleteBoard);
  elements.ticketTagToggle.addEventListener("click", handleTicketTagFieldClick);
  elements.ticketNewTagButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    createTagFromEditor();
  });
  elements.ticketTagSearch.addEventListener("focus", openTicketTagOptions);
  elements.ticketTagSearch.addEventListener("input", handleTicketTagSearchInput);
  elements.ticketTagSearch.addEventListener("keydown", handleTicketTagSearchKeydown);
  elements.ticketBlockerToggle.addEventListener("click", handleBlockerFieldClick);
  elements.ticketBlockerSearch.addEventListener("focus", openBlockerOptions);
  elements.ticketBlockerSearch.addEventListener("input", handleBlockerSearchInput);
  elements.ticketBlockerSearch.addEventListener("keydown", handleBlockerSearchKeydown);
  elements.ticketChildToggle.addEventListener("click", handleChildFieldClick);
  elements.ticketChildSearch.addEventListener("focus", openChildOptions);
  elements.ticketChildSearch.addEventListener("input", handleChildSearchInput);
  elements.ticketChildSearch.addEventListener("keydown", handleChildSearchKeydown);
  elements.ticketParentToggle.addEventListener("click", handleParentFieldClick);
  elements.ticketParentSearch.addEventListener("focus", openParentOptions);
  elements.ticketParentSearch.addEventListener("input", handleParentSearchInput);
  elements.ticketParentSearch.addEventListener("keydown", handleParentSearchKeydown);
  elements.viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.viewMode || "kanban";
      syncViewMode();
      renderBoardDetail();
      syncBoardUrl();
    });
  });
  elements.searchInput.addEventListener("input", async (event) => {
    state.filters.q = event.target.value.trim();
    await refreshBoardDetail();
  });
  elements.laneFilter.addEventListener("change", async (event) => {
    state.filters.lane = event.target.value;
    await refreshBoardDetail();
  });
  elements.completedFilterButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.filters.completed = button.dataset.value ?? "";
      syncCompletedFilter();
      await refreshBoardDetail();
    });
  });
  elements.tagFilter.addEventListener("change", async (event) => {
    state.filters.tag = event.target.value;
    await refreshBoardDetail();
  });
  elements.editorForm.addEventListener("submit", saveTicket);
  elements.commentForm.addEventListener("submit", addComment);
  elements.saveCommentButton.addEventListener("click", addComment);
  elements.uxForm.addEventListener("submit", handleUxSubmit);
  elements.uxDangerButton.addEventListener("click", handleUxDanger);
  elements.deleteTicketButton.addEventListener("click", deleteTicket);
  elements.headerEditButton.addEventListener("click", () => setDialogMode("edit"));
  elements.cancelEditButton.addEventListener("click", () => {
    if (state.editingTicketId) {
      setDialogMode("view");
      return;
    }
    closeEditor();
  });
  elements.editorDialog.addEventListener("close", handleEditorDialogClose);
  elements.editorDialog.addEventListener("click", handleDialogBackdropClick);
  elements.uxCancelButton.addEventListener("click", () => finishUxDialog(null));
  elements.uxDismissButton.addEventListener("click", () => finishUxDialog(null));
  elements.uxDialog.addEventListener("close", () => finishUxDialog(null));
  elements.uxDialog.addEventListener("click", handleDialogBackdropClick);
  elements.exportBoardButton.addEventListener("click", exportBoard);
  elements.importBoardInput.addEventListener("change", importBoard);
  elements.laneBoard.addEventListener("dragover", handleLaneDragOver);
  window.addEventListener("popstate", () => {
    applyRouteFromLocation().catch((error) => {
      console.error(error);
      showToast(error.message, "error");
    });
  });
  document.addEventListener("click", handleDocumentClick);
}

function handleDialogBackdropClick(event) {
  const dialog = event.currentTarget;
  if (!(dialog instanceof HTMLDialogElement) || event.target !== dialog) {
    return;
  }
  const rect = dialog.getBoundingClientRect();
  const isInside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (isInside) {
    return;
  }
  if (dialog === elements.editorDialog) {
    closeEditor();
    return;
  }
  finishUxDialog(null);
}

async function refreshBoards() {
  const data = await api("/api/boards");
  state.boards = data.boards;
  if (!state.activeBoardId && state.boards.length > 0) {
    state.activeBoardId = state.boards[0].id;
  }
  renderBoards();
  await refreshBoardDetail();
}

function resetBoardFilters() {
  state.filters = { q: "", lane: "", completed: "", tag: "" };
  elements.searchInput.value = "";
  elements.laneFilter.value = "";
  syncCompletedFilter("");
  elements.tagFilter.value = "";
}

async function selectBoard(boardId) {
  state.activeBoardId = boardId;
  resetBoardFilters();
  await refreshBoardDetail();
  syncBoardUrl();
}

async function refreshBoardDetail() {
  if (!state.activeBoardId) {
    closeBoardEvents();
    state.boardDetail = null;
    state.boardTickets = [];
    renderBoardDetail();
    return;
  }
  const ticketListUrl = `/api/boards/${state.activeBoardId}/tickets`;
  const [detail, allTickets] = await Promise.all([
    api(`/api/boards/${state.activeBoardId}`),
    api(ticketListUrl),
  ]);
  const hasFilters = Object.values(state.filters).some((value) => value !== "");
  const tickets = hasFilters
    ? await api(
        `${ticketListUrl}?${new URLSearchParams(
          Object.entries(state.filters)
            .filter(([, value]) => value !== "")
            .map(([key, value]) => [key === "lane" ? "lane_id" : key, value]),
        ).toString()}`,
      )
    : allTickets;
  state.boardTickets = allTickets.tickets;
  state.boardDetail = {
    board: detail.board,
    lanes: detail.lanes,
    tags: detail.tags,
    tickets: tickets.tickets,
  };
  syncBoardEvents();
  renderBoards();
  renderBoardDetail();
}

function closeBoardEvents() {
  if (state.boardEvents) {
    state.boardEvents.close();
  }
  state.boardEvents = null;
  state.boardEventsBoardId = null;
}

function syncBoardEvents() {
  if (!state.activeBoardId) {
    closeBoardEvents();
    return;
  }
  if (state.boardEvents && state.boardEventsBoardId === state.activeBoardId) {
    return;
  }
  closeBoardEvents();
  const source = new EventSource(`/api/boards/${state.activeBoardId}/events`);
  source.onmessage = () => {
    handleBoardUpdatedEvent().catch((error) => {
      console.error(error);
    });
  };
  source.addEventListener("board_updated", handleBoardUpdatedEvent);
  source.addEventListener("board_imported", handleBoardUpdatedEvent);
  source.addEventListener("board_created", handleBoardUpdatedEvent);
  source.onerror = () => {
    if (state.boardEvents === source && source.readyState === EventSource.CLOSED) {
      closeBoardEvents();
    }
  };
  state.boardEvents = source;
  state.boardEventsBoardId = state.activeBoardId;
}

async function handleBoardUpdatedEvent() {
  if (state.viewMode !== "kanban" || elements.editorDialog.open || !state.activeBoardId) {
    return;
  }
  if (state.boardRefreshInFlight) {
    state.boardRefreshQueued = true;
    return;
  }
  state.boardRefreshInFlight = true;
  try {
    await refreshBoardDetail();
  } catch (error) {
    console.error(error);
  } finally {
    state.boardRefreshInFlight = false;
    if (state.boardRefreshQueued) {
      state.boardRefreshQueued = false;
      queueMicrotask(() => {
        handleBoardUpdatedEvent().catch((error) => {
          console.error(error);
        });
      });
    }
  }
}

function readRouteFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const [kind, rawId, rawView] = parts;
  const id = Number(rawId);
  if (kind === "boards" && Number.isInteger(id) && id > 0) {
    return { kind: "board", id, viewMode: rawView === "list" ? "list" : "kanban" };
  }
  if (kind === "tickets" && Number.isInteger(id) && id > 0) {
    return { kind: "ticket", id };
  }
  return { kind: "home" };
}

async function applyRouteFromLocation({ replace = false } = {}) {
  const route = readRouteFromLocation();

  if (route.kind === "ticket") {
    try {
      const ticket = await api(`/api/tickets/${route.id}`);
      state.activeBoardId = ticket.boardId;
      resetBoardFilters();
      await refreshBoardDetail();
      await openEditor(ticket.id, "view");
      if (replace) {
        syncTicketUrl(ticket.id, { replace: true });
      }
      return;
    } catch {
      showToast("Ticket not found", "error");
    }
  }

  if (route.kind === "board") {
    if (state.boards.some((board) => board.id === route.id)) {
      state.activeBoardId = route.id;
      state.viewMode = route.viewMode;
      resetBoardFilters();
      await refreshBoardDetail();
      if (elements.editorDialog.open) {
        state.skipDialogCloseSync = true;
        elements.editorDialog.close();
      }
      if (replace) {
        syncBoardUrl(true);
      }
      return;
    }
    showToast("Board not found", "error");
  }

  if (state.boards.length > 0) {
    state.activeBoardId =
      state.activeBoardId && state.boards.some((board) => board.id === state.activeBoardId)
        ? state.activeBoardId
        : state.boards[0].id;
    resetBoardFilters();
    await refreshBoardDetail();
    if (elements.editorDialog.open) {
      state.skipDialogCloseSync = true;
      elements.editorDialog.close();
    }
    syncBoardUrl(replace);
    return;
  }

  state.activeBoardId = null;
  await refreshBoardDetail();
}

function setUrl(pathname, { replace = false } = {}) {
  if (window.location.pathname === pathname) {
    return;
  }
  const method = replace ? "replaceState" : "pushState";
  window.history[method](null, "", pathname);
}

function syncBoardUrl(replace = false) {
  const pathname = !state.activeBoardId
    ? "/"
    : state.viewMode === "list"
      ? `/boards/${state.activeBoardId}/list`
      : `/boards/${state.activeBoardId}`;
  setUrl(pathname, { replace });
}

function syncTicketUrl(ticketId, { replace = false } = {}) {
  setUrl(`/tickets/${ticketId}`, { replace });
}

async function sendJson(url, { method, body }) {
  return api(url, {
    method,
    body: JSON.stringify(body),
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error ?? response.statusText);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

const editorModule = createEditorModule({
  state,
  elements,
  api,
  escapeHtml,
  refreshBoardDetail,
  sendJson,
  syncBoardUrl,
  syncTicketUrl,
});

const {
  addComment,
  closeEditor,
  confirmAndRun,
  createTagFromEditor,
  deleteTicket,
  finishUxDialog,
  handleBlockerFieldClick,
  handleBlockerSearchInput,
  handleBlockerSearchKeydown,
  handleChildFieldClick,
  handleChildSearchInput,
  handleChildSearchKeydown,
  handleDocumentClick,
  handleEditorDialogClose,
  handleParentChange,
  handleParentFieldClick,
  handleParentSearchInput,
  handleParentSearchKeydown,
  handleTicketTagSearchInput,
  handleTicketTagSearchKeydown,
  handleTicketTagFieldClick,
  handleUxDanger,
  handleUxSubmit,
  openBlockerOptions,
  openChildOptions,
  openEditor,
  openParentOptions,
  openTicketTagOptions,
  requestFields,
  requestFieldsAction,
  saveTicket,
  setDialogMode,
  showToast,
  syncTicketTagOptions,
} = editorModule;

const boardModule = createBoardModule({
  state,
  elements,
  api,
  confirmAndRun,
  escapeHtml,
  openEditor,
  refreshBoardDetail,
  refreshBoards,
  requestFields,
  requestFieldsAction,
  selectBoard,
  sendJson,
  showToast,
  syncBoardUrl,
  syncListActionButtons,
  syncTicketTagOptions,
  syncViewMode,
});

const {
  renderBoards,
  renderBoardDetail,
  renderSidebarTags,
  handleLaneDragOver,
  createBoard,
  createLane,
  renameBoard,
  deleteBoard,
  createTag,
  renameLane,
  deleteLane,
  exportBoard,
  importBoard,
  toggleSidebar,
  syncSidebar,
} = boardModule;

main().catch((error) => {
  console.error(error);
  showToast(error.message, "error");
});

function syncCompletedFilter(value = state.filters.completed) {
  state.filters.completed = value;
  elements.completedFilterButtons.forEach((button) => {
    button.classList.toggle("active", (button.dataset.value ?? "") === value);
  });
}
