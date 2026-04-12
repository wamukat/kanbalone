import { api, createSendJson } from "./app-api.js";
import { createBoardModule } from "./app-board.js";
import { createEditorModule } from "./app-editor.js";
import { createUxModule } from "./app-ux.js";

const state = {
  boards: [],
  activeBoardId: null,
  boardDetail: null,
  boardTickets: [],
  boardEvents: null,
  boardEventsBoardId: null,
  boardRefreshInFlight: false,
  boardRefreshQueued: false,
  isCreatingBoard: false,
  isCreatingLane: false,
  viewMode: "kanban",
  selectedListTicketIds: [],
  sidebarCollapsed: localStorage.getItem("soloboard:sidebar-collapsed") === "true",
  boardSettingsExpanded: false,
  filters: {
    q: "",
    lane: "",
    resolved: "false",
    tag: "",
    archived: "",
  },
  editingTicketId: null,
  activeBoardDragId: null,
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
  editorDialogPosition: null,
  editorDialogDrag: null,
};

const elements = {
  shell: document.querySelector(".shell"),
  sidebar: document.querySelector("#sidebar"),
  boardList: document.querySelector("#board-list"),
  sidebarTagSection: document.querySelector("#sidebar-tag-section"),
  sidebarTagList: document.querySelector("#sidebar-tag-list"),
  newSidebarTagButton: document.querySelector("#new-sidebar-tag-button"),
  sidebarBoardSection: document.querySelector("#sidebar-board-section"),
  boardSettingsToggleButton: document.querySelector("#board-settings-toggle-button"),
  sidebarBoardActionsPanel: document.querySelector("#sidebar-board-actions-panel"),
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
  archivedFilterButton: document.querySelector("#archived-filter-button"),
  viewModeButtons: [...document.querySelectorAll("#view-mode-toggle button")],
  resolvedFilter: document.querySelector("#resolved-filter"),
  resolvedFilterButtons: [...document.querySelectorAll("#resolved-filter button")],
  tagFilter: document.querySelector("#tag-filter"),
  exportBoardButton: document.querySelector("#export-board-button"),
  importBoardInput: document.querySelector("#import-board-input"),
  editorDialog: document.querySelector("#editor-dialog"),
  editorHeader: document.querySelector(".editor-header"),
  editorHeaderState: document.querySelector("#editor-header-state"),
  editorHeaderId: document.querySelector("#editor-header-id"),
  editorHeaderTitle: document.querySelector("#editor-header-title"),
  editorSaveState: document.querySelector("#editor-save-state"),
  archiveTicketButton: document.querySelector("#archive-ticket-button"),
  headerEditButton: document.querySelector("#header-edit-button"),
  ticketView: document.querySelector("#ticket-view"),
  editorForm: document.querySelector("#editor-form"),
  ticketViewMeta: document.querySelector("#ticket-view-meta"),
  ticketRelations: document.querySelector("#ticket-relations"),
  ticketViewBody: document.querySelector("#ticket-view-body"),
  commentsTabButton: document.querySelector("#comments-tab-button"),
  activityTabButton: document.querySelector("#activity-tab-button"),
  commentsSection: document.querySelector("#comments-section"),
  activitySection: document.querySelector("#activity-section"),
  ticketComments: document.querySelector("#ticket-comments"),
  ticketActivity: document.querySelector("#ticket-activity"),
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
  ticketResolved: document.querySelector("#ticket-resolved"),
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
  ticketResolvedRow: document.querySelector("#ticket-resolved-row"),
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
  footerAppLabel: document.querySelector("#footer-app-label"),
};

async function main() {
  bindEvents();
  await loadAppMeta();
  syncSidebar();
  syncResolvedFilter();
  syncArchivedFilter();
  syncViewMode();
  await refreshBoards();
  await applyRouteFromLocation({ replace: true });
}

async function loadAppMeta() {
  try {
    const meta = await api("/api/meta");
    elements.footerAppLabel.textContent = `${meta.name} (v${meta.version})`;
  } catch (error) {
    console.warn("Failed to load app metadata", error);
  }
}

function syncViewMode() {
  elements.viewModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
  });
  elements.laneBoard.hidden = state.viewMode !== "kanban";
  elements.listBoard.hidden = state.viewMode !== "list";
  elements.laneFilter.hidden = state.viewMode !== "list";
}

function bindEvents() {
  elements.sidebarToggleButton.addEventListener("click", toggleSidebar);
  elements.sidebarReopenButton.addEventListener("click", toggleSidebar);
  elements.newBoardButton.addEventListener("click", createBoard);
  elements.newSidebarTagButton.addEventListener("click", createTag);
  elements.boardSettingsToggleButton.addEventListener("click", toggleBoardSettings);
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
  elements.archivedFilterButton.addEventListener("click", async () => {
    state.filters.archived = state.filters.archived === "all" ? "" : "all";
    syncArchivedFilter();
    await refreshBoardDetail();
  });
  elements.resolvedFilterButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.filters.resolved = button.dataset.value ?? "";
      syncResolvedFilter();
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
  elements.ticketComments.addEventListener("click", handleCommentAction);
  elements.commentsTabButton.addEventListener("click", () => setDetailTab("comments"));
  elements.activityTabButton.addEventListener("click", () => setDetailTab("activity"));
  elements.editorHeader.addEventListener("pointerdown", handleEditorHeaderPointerDown);
  elements.uxForm.addEventListener("submit", handleUxSubmit);
  elements.uxDangerButton.addEventListener("click", handleUxDanger);
  elements.deleteTicketButton.addEventListener("click", deleteTicket);
  elements.archiveTicketButton.addEventListener("click", toggleTicketArchive);
  elements.headerEditButton.addEventListener("click", () => setDialogMode("edit"));
  elements.cancelEditButton.addEventListener("click", () => {
    if (state.editingTicketId) {
      setDialogMode("view");
      return;
    }
    closeEditor();
  });
  elements.editorDialog.addEventListener("close", () => {
    handleEditorDialogClose();
    syncDialogScrollLock();
  });
  elements.editorDialog.addEventListener("click", handleDialogBackdropClick);
  elements.uxCancelButton.addEventListener("click", () => finishUxDialog(null));
  elements.uxDismissButton.addEventListener("click", () => finishUxDialog(null));
  elements.uxDialog.addEventListener("close", () => {
    finishUxDialog(null);
    syncDialogScrollLock();
  });
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
  window.addEventListener("pointermove", handleEditorHeaderPointerMove);
  window.addEventListener("pointerup", handleEditorHeaderPointerUp);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
}

function clampEditorDialogPosition(left, top) {
  const rect = elements.editorDialog.getBoundingClientRect();
  const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
  const minTop = window.scrollY + 12;
  return {
    left: Math.min(Math.max(12, left), maxLeft),
    top: Math.max(minTop, top),
  };
}

function applyEditorDialogPosition(position) {
  if (!position) {
    return;
  }
  const clamped = clampEditorDialogPosition(position.left, position.top);
  state.editorDialogPosition = clamped;
  elements.editorDialog.style.left = `${clamped.left}px`;
  elements.editorDialog.style.top = `${clamped.top}px`;
}

function prepareEditorDialogPosition(scrollY = window.scrollY) {
  const dialogWidth = Math.min(720, Math.max(0, window.innerWidth - 32));
  const position = {
    left: Math.max(12, (window.innerWidth - dialogWidth) / 2),
    top: scrollY + 48,
  };
  state.editorDialogPosition = position;
  elements.editorDialog.style.left = `${position.left}px`;
  elements.editorDialog.style.top = `${position.top}px`;
}

function ensureEditorDialogPosition() {
  if (state.editorDialogPosition) {
    applyEditorDialogPosition(state.editorDialogPosition);
    return;
  }
  const rect = elements.editorDialog.getBoundingClientRect();
  applyEditorDialogPosition({
    left: Math.max(12, (window.innerWidth - rect.width) / 2),
    top: window.scrollY + 48,
  });
}

function handleEditorHeaderPointerDown(event) {
  if (!elements.editorDialog.open) {
    return;
  }
  if (event.button !== 0 || event.target.closest("button")) {
    return;
  }
  const rect = elements.editorDialog.getBoundingClientRect();
  state.editorDialogDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
  };
  elements.editorDialog.classList.add("dragging");
  event.preventDefault();
}

function handleEditorHeaderPointerMove(event) {
  const drag = state.editorDialogDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  applyEditorDialogPosition({
    left: drag.left + (event.clientX - drag.startX),
    top: window.scrollY + drag.top + (event.clientY - drag.startY),
  });
}

function handleEditorHeaderPointerUp(event) {
  const drag = state.editorDialogDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  state.editorDialogDrag = null;
  elements.editorDialog.classList.remove("dragging");
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

function handleDocumentKeydown(event) {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
    return;
  }
  if (elements.uxDialog.open || !elements.editorDialog.open) {
    return;
  }
  event.preventDefault();
  closeEditor();
}

function syncEditorDialogScrollSpace() {
  if (!elements.editorDialog.open) {
    document.body.style.minHeight = "";
    return;
  }
  const rect = elements.editorDialog.getBoundingClientRect();
  const dialogBottom = window.scrollY + rect.bottom;
  document.body.style.minHeight = `${Math.ceil(dialogBottom + 32)}px`;
}

function syncDialogScrollLock() {
  const shouldLockScroll = elements.uxDialog.open;
  document.documentElement.classList.toggle("dialog-scroll-locked", shouldLockScroll);
  document.body.classList.toggle("dialog-scroll-locked", shouldLockScroll);
  document.body.classList.toggle("editor-dialog-open", elements.editorDialog.open);
  syncEditorDialogScrollSpace();
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
  state.filters = { q: "", lane: "", resolved: "false", tag: "", archived: "" };
  elements.searchInput.value = "";
  elements.laneFilter.value = "";
  syncResolvedFilter();
  syncArchivedFilter();
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
  const buildTicketListUrl = (filters = {}) => {
    const params = new URLSearchParams();
    const archived = filters.archived ?? state.filters.archived;
    if (archived === "all") {
      params.set("archived", "all");
    }
    if (filters.lane ?? state.filters.lane) {
      params.set("lane_id", String(filters.lane ?? state.filters.lane));
    }
    if (filters.resolved ?? state.filters.resolved) {
      params.set("resolved", String(filters.resolved ?? state.filters.resolved));
    }
    if (filters.tag ?? state.filters.tag) {
      params.set("tag", String(filters.tag ?? state.filters.tag));
    }
    if (filters.q ?? state.filters.q) {
      params.set("q", String(filters.q ?? state.filters.q));
    }
    const query = params.toString();
    return `/api/boards/${state.activeBoardId}/tickets${query ? `?${query}` : ""}`;
  };
  const ticketListUrl = buildTicketListUrl();
  const [detail, allTickets] = await Promise.all([
    api(`/api/boards/${state.activeBoardId}`),
    api(ticketListUrl),
  ]);
  const hasFilters = Object.entries(state.filters).some(([key, value]) => key !== "archived" && value !== "");
  const tickets = hasFilters
    ? await api(buildTicketListUrl())
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const sendJson = createSendJson(api);

const uxModule = createUxModule({
  state,
  elements,
  syncDialogScrollLock,
  escapeHtml,
});

const { confirmAndRun, finishUxDialog, handleUxDanger, handleUxSubmit, requestFields, requestFieldsAction, showToast } = uxModule;

const editorModule = createEditorModule({
  state,
  elements,
  api,
  confirmAndRun,
  escapeHtml,
  ensureEditorDialogPosition,
  prepareEditorDialogPosition,
  requestFields,
  refreshBoardDetail,
  sendJson,
  showToast,
  syncBoardUrl,
  syncDialogScrollLock,
  syncTicketUrl,
});

const {
  addComment,
  handleCommentAction,
  closeEditor,
  createTagFromEditor,
  deleteTicket,
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
  openBlockerOptions,
  openChildOptions,
  openEditor,
  openParentOptions,
  openTicketTagOptions,
  saveTicket,
  setDetailTab,
  setDialogMode,
  syncTicketTagOptions,
  toggleTicketArchive,
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
  toggleBoardSettings,
  syncSidebar,
} = boardModule;

main().catch((error) => {
  console.error(error);
  showToast(error.message, "error");
});

function syncResolvedFilter(value = state.filters.resolved) {
  state.filters.resolved = value;
  elements.resolvedFilterButtons.forEach((button) => {
    button.classList.toggle("active", (button.dataset.value ?? "") === value);
  });
}

function syncArchivedFilter() {
  elements.archivedFilterButton.classList.toggle("active", state.filters.archived === "all");
}
