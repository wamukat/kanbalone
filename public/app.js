import { api, createSendJson } from "./app-api.js";
import { createBoardModule } from "./app-board.js";
import { createEditorModule } from "./app-editor.js";
import { createFiltersModule } from "./app-filters.js";
import { createUxModule } from "./app-ux.js";

const UI_PREFERENCES_KEY = "kanbalone:ui-preferences";
const UI_PREFERENCES_VERSION = 1;
const DEFAULT_FILTERS = { q: "", lane: "", status: ["open"], priority: [], tag: "" };
const storedPreferences = readUiPreferences();

const state = {
  boards: [],
  activeBoardId: storedPreferences.activeBoardId,
  boardDetail: null,
  boardTickets: [],
  boardEvents: null,
  boardEventsBoardId: null,
  boardRefreshInFlight: false,
  boardRefreshQueued: false,
  boardRefreshPendingAfterDialog: false,
  isCreatingBoard: false,
  isRenamingBoard: false,
  boardRenameError: "",
  isCreatingLane: false,
  isCreatingSidebarTag: false,
  editingSidebarTagId: null,
  confirmingSidebarTagDeleteId: null,
  sidebarTagError: "",
  confirmingCommentDeleteId: null,
  viewMode: "kanban",
  selectedListTicketIds: [],
  sidebarCollapsed: localStorage.getItem("kanbalone:sidebar-collapsed") === "true",
  boardSettingsExpanded: false,
  filters: {
    q: "",
    lane: "",
    status: ["open"],
    priority: [],
    tag: "",
  },
  filtersByBoardId: storedPreferences.filtersByBoardId,
  viewModeByBoardId: storedPreferences.viewModeByBoardId,
  filterExpansionByBoardId: storedPreferences.filterExpansionByBoardId,
  editingTicketId: null,
  activeBoardDragId: null,
  activeLaneDragId: null,
  dialogMode: "view",
  dialogActivity: [],
  skipDialogCloseSync: false,
  toastTimer: null,
  uxResolver: null,
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
  uxDialogPosition: null,
  uxDialogDrag: null,
};

function createDefaultUiPreferences() {
  return {
    activeBoardId: null,
    filtersByBoardId: {},
    viewModeByBoardId: {},
    filterExpansionByBoardId: {},
  };
}

function readUiPreferences() {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_KEY);
    if (!raw) {
      return createDefaultUiPreferences();
    }
    const parsed = JSON.parse(raw);
    return parsed?.version === UI_PREFERENCES_VERSION
      ? readVersionedUiPreferences(parsed)
      : readLegacyUiPreferences(parsed);
  } catch {
    return createDefaultUiPreferences();
  }
}

function readVersionedUiPreferences(parsed) {
  const preferences = createDefaultUiPreferences();
  preferences.activeBoardId = normalizeBoardId(parsed?.activeBoardId);

  for (const [boardId, boardPreferences] of Object.entries(normalizeObject(parsed?.boards))) {
    if (!normalizeBoardId(boardId)) {
      continue;
    }
    const normalizedBoardId = String(boardId);
    preferences.filtersByBoardId[normalizedBoardId] = normalizeStoredFilters(boardPreferences?.filters);
    preferences.viewModeByBoardId[normalizedBoardId] = boardPreferences?.viewMode === "list" ? "list" : "kanban";
    preferences.filterExpansionByBoardId[normalizedBoardId] = normalizeStoredFilterExpansion(boardPreferences?.filterExpansion);
  }

  return preferences;
}

function readLegacyUiPreferences(parsed) {
  const activeBoardId = normalizeBoardId(parsed?.activeBoardId);
  const viewModeByBoardId = normalizeStoredViewModesByBoard(parsed?.viewModeByBoardId);
  if (activeBoardId && !viewModeByBoardId[String(activeBoardId)] && parsed?.viewMode === "list") {
    viewModeByBoardId[String(activeBoardId)] = "list";
  }
  return {
    activeBoardId,
    filtersByBoardId: normalizeStoredFiltersByBoard(parsed?.filtersByBoardId),
    viewModeByBoardId,
    filterExpansionByBoardId: normalizeStoredFilterExpansionByBoard(parsed?.filterExpansionByBoardId),
  };
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeBoardId(value) {
  const boardId = Number(value);
  return Number.isInteger(boardId) && boardId > 0 ? boardId : null;
}

function normalizeStoredViewModesByBoard(value) {
  return Object.fromEntries(
    Object.entries(normalizeObject(value))
      .filter(([boardId, viewMode]) => normalizeBoardId(boardId) && ["kanban", "list"].includes(viewMode))
      .map(([boardId, viewMode]) => [String(boardId), viewMode]),
  );
}

function normalizeStoredFilterExpansionByBoard(value) {
  return Object.fromEntries(
    Object.entries(normalizeObject(value))
      .filter(([boardId, expansion]) => normalizeBoardId(boardId) && expansion && typeof expansion === "object" && !Array.isArray(expansion))
      .map(([boardId, expansion]) => [String(boardId), normalizeStoredFilterExpansion(expansion)]),
  );
}

function normalizeStoredFilterExpansion(expansion) {
  return {
    status: expansion?.status === true,
    priority: expansion?.priority === true,
  };
}

function normalizeStoredFiltersByBoard(value) {
  return Object.fromEntries(
    Object.entries(normalizeObject(value))
      .filter(([boardId]) => normalizeBoardId(boardId))
      .map(([boardId, filters]) => [String(boardId), normalizeStoredFilters(filters)]),
  );
}

function normalizeStoredFilters(filters) {
  const status = Array.isArray(filters?.status)
    ? filters.status.filter((item) => ["open", "resolved", "archived"].includes(item))
    : [];
  const priority = Array.isArray(filters?.priority)
    ? filters.priority.filter((item) => ["low", "medium", "high", "urgent"].includes(item))
    : [];
  return {
    q: typeof filters?.q === "string" ? filters.q : DEFAULT_FILTERS.q,
    lane: typeof filters?.lane === "string" ? filters.lane : DEFAULT_FILTERS.lane,
    status: status.length ? [...new Set(status)] : [...DEFAULT_FILTERS.status],
    priority: [...new Set(priority)],
    tag: typeof filters?.tag === "string" ? filters.tag : DEFAULT_FILTERS.tag,
  };
}

function persistUiPreferences() {
  try {
    localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify({
      version: UI_PREFERENCES_VERSION,
      activeBoardId: state.activeBoardId,
      boards: buildBoardUiPreferences(),
    }));
  } catch (error) {
    console.warn("Failed to persist UI preferences", error);
  }
}

function buildBoardUiPreferences() {
  const boardIds = new Set([
    ...Object.keys(state.filtersByBoardId),
    ...Object.keys(state.viewModeByBoardId),
    ...Object.keys(state.filterExpansionByBoardId),
  ]);

  return Object.fromEntries(
    [...boardIds]
      .filter((boardId) => normalizeBoardId(boardId))
      .map((boardId) => [boardId, {
        filters: normalizeStoredFilters(state.filtersByBoardId[boardId]),
        viewMode: state.viewModeByBoardId[boardId] === "list" ? "list" : "kanban",
        filterExpansion: normalizeStoredFilterExpansion(state.filterExpansionByBoardId[boardId]),
      }]),
  );
}

function pruneUiPreferencesForBoards() {
  const boardIds = new Set(state.boards.map((board) => String(board.id)));
  state.filtersByBoardId = Object.fromEntries(
    Object.entries(state.filtersByBoardId).filter(([boardId]) => boardIds.has(boardId)),
  );
  state.viewModeByBoardId = Object.fromEntries(
    Object.entries(state.viewModeByBoardId).filter(([boardId]) => boardIds.has(boardId)),
  );
  state.filterExpansionByBoardId = Object.fromEntries(
    Object.entries(state.filterExpansionByBoardId).filter(([boardId]) => boardIds.has(boardId)),
  );
}

function saveBoardViewMode(boardId = state.activeBoardId, viewMode = state.viewMode) {
  if (!boardId) {
    return;
  }
  state.viewModeByBoardId[String(boardId)] = viewMode === "list" ? "list" : "kanban";
  persistUiPreferences();
}

function restoreBoardViewMode(boardId = state.activeBoardId) {
  state.viewMode = boardId && state.viewModeByBoardId[String(boardId)] === "list" ? "list" : "kanban";
}

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
  boardRenameInlineHost: document.querySelector("#board-rename-inline-host"),
  deleteBoardButton: document.querySelector("#delete-board-button"),
  boardTitle: document.querySelector("#board-title"),
  laneBoard: document.querySelector("#lane-board"),
  listBoard: document.querySelector("#list-board"),
  sidebarToggleButton: document.querySelector("#sidebar-toggle-button"),
  sidebarReopenButton: document.querySelector("#sidebar-reopen-button"),
  newBoardButton: document.querySelector("#new-board-button"),
  searchInput: document.querySelector("#search-input"),
  searchClearButton: document.querySelector("#search-clear-button"),
  laneFilter: document.querySelector("#lane-filter"),
  viewModeButtons: [...document.querySelectorAll("#view-mode-toggle button")],
  statusFilter: document.querySelector("#status-filter"),
  statusFilterToggles: [...document.querySelectorAll("#status-filter [data-filter-expand='status']")],
  statusFilterButtons: [...document.querySelectorAll("#status-filter [data-status-filter]")],
  statusFilterClearButton: document.querySelector("#status-filter [data-status-clear]"),
  statusFilterSummary: document.querySelector("#status-filter-summary"),
  statusFilterOptions: document.querySelector("#status-filter .filter-menu-options"),
  priorityFilter: document.querySelector("#priority-filter"),
  priorityFilterToggles: [...document.querySelectorAll("#priority-filter [data-filter-expand='priority']")],
  priorityFilterButtons: [...document.querySelectorAll("#priority-filter [data-priority-filter]")],
  priorityFilterClearButton: document.querySelector("#priority-filter [data-priority-clear]"),
  priorityFilterSummary: document.querySelector("#priority-filter-summary"),
  priorityFilterOptions: document.querySelector("#priority-filter .filter-menu-options"),
  tagFilter: document.querySelector("#tag-filter"),
  resetFiltersButton: document.querySelector("#reset-filters-button"),
  exportBoardButton: document.querySelector("#export-board-button"),
  importBoardInput: document.querySelector("#import-board-input"),
  editorDialog: document.querySelector("#editor-dialog"),
  editorHeader: document.querySelector(".editor-header"),
  editorHeaderState: document.querySelector("#editor-header-state"),
  editorHeaderId: document.querySelector("#editor-header-id"),
  editorHeaderTitle: document.querySelector("#editor-header-title"),
  editorHeaderPriority: document.querySelector("#editor-header-priority"),
  editorSaveState: document.querySelector("#editor-save-state"),
  archiveTicketButton: document.querySelector("#archive-ticket-button"),
  moveTicketButton: document.querySelector("#move-ticket-button"),
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
  commentComposeToggle: document.querySelector("#comment-compose-toggle"),
  commentForm: document.querySelector("#comment-form"),
  commentBody: document.querySelector("#comment-body"),
  commentSaveState: document.querySelector("#comment-save-state"),
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
  uxHeader: document.querySelector("#ux-form .editor-header"),
  uxTitle: document.querySelector("#ux-title"),
  uxMessage: document.querySelector("#ux-message"),
  uxFields: document.querySelector("#ux-fields"),
  uxError: document.querySelector("#ux-error"),
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
  syncStatusFilter();
  syncViewMode();
  syncActiveFilterStyles();
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

function bindEvents() {
  elements.sidebarToggleButton.addEventListener("click", toggleSidebar);
  elements.sidebarReopenButton.addEventListener("click", toggleSidebar);
  elements.newBoardButton.addEventListener("click", createBoard);
  elements.newSidebarTagButton.addEventListener("click", createTag);
  elements.boardSettingsToggleButton.addEventListener("click", toggleBoardSettings);
  elements.deleteBoardButton.addEventListener("click", deleteBoard);
  elements.ticketTagToggle.addEventListener("click", handleTicketTagFieldClick);
  elements.ticketTagSearch.addEventListener("input", handleTicketTagSearchInput);
  elements.ticketTagSearch.addEventListener("keydown", handleTicketTagSearchKeydown);
  elements.ticketBlockerToggle.addEventListener("click", handleBlockerFieldClick);
  elements.ticketBlockerSearch.addEventListener("input", handleBlockerSearchInput);
  elements.ticketBlockerSearch.addEventListener("keydown", handleBlockerSearchKeydown);
  elements.ticketChildToggle.addEventListener("click", handleChildFieldClick);
  elements.ticketChildSearch.addEventListener("input", handleChildSearchInput);
  elements.ticketChildSearch.addEventListener("keydown", handleChildSearchKeydown);
  elements.ticketParentToggle.addEventListener("click", handleParentFieldClick);
  elements.ticketParentSearch.addEventListener("input", handleParentSearchInput);
  elements.ticketParentSearch.addEventListener("keydown", handleParentSearchKeydown);
  bindFilterEvents();
  elements.editorForm.addEventListener("submit", saveTicket);
  elements.commentForm.addEventListener("submit", addComment);
  elements.commentComposeToggle.addEventListener("click", toggleCommentComposer);
  elements.saveCommentButton.addEventListener("click", addComment);
  elements.ticketComments.addEventListener("click", handleCommentAction);
  elements.editorHeader.addEventListener("click", handleDetailClick);
  elements.ticketView.addEventListener("click", handleDetailClick);
  elements.editorHeader.addEventListener("change", handleDetailChange);
  elements.ticketView.addEventListener("change", handleDetailChange);
  elements.editorHeader.addEventListener("focusout", handleDetailFocusout);
  elements.editorHeader.addEventListener("keydown", handleDetailKeydown);
  elements.ticketView.addEventListener("keydown", handleDetailKeydown);
  elements.commentsTabButton.addEventListener("click", () => setDetailTab("comments"));
  elements.activityTabButton.addEventListener("click", () => setDetailTab("activity"));
  elements.editorHeader.addEventListener("pointerdown", handleEditorHeaderPointerDown);
  elements.uxHeader.addEventListener("pointerdown", handleUxHeaderPointerDown);
  elements.uxForm.addEventListener("submit", handleUxSubmit);
  elements.deleteTicketButton.addEventListener("click", deleteTicket);
  elements.archiveTicketButton.addEventListener("click", toggleTicketArchive);
  elements.moveTicketButton.addEventListener("click", moveTicketToBoard);
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
    state.uxDialogDrag = null;
    elements.uxDialog.classList.remove("dragging");
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
  window.addEventListener("pointermove", handleUxHeaderPointerMove);
  window.addEventListener("pointerup", handleUxHeaderPointerUp);
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
  if (event.button !== 0 || event.target.closest("button, input, textarea, select")) {
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

function clampUxDialogPosition(left, top) {
  const rect = elements.uxDialog.getBoundingClientRect();
  return {
    left: Math.min(Math.max(12, left), Math.max(12, window.innerWidth - rect.width - 12)),
    top: Math.min(Math.max(12, top), Math.max(12, window.innerHeight - rect.height - 12)),
  };
}

function applyUxDialogPosition(position) {
  if (!position) {
    return;
  }
  const clamped = clampUxDialogPosition(position.left, position.top);
  state.uxDialogPosition = clamped;
  elements.uxDialog.style.left = `${clamped.left}px`;
  elements.uxDialog.style.top = `${clamped.top}px`;
}

function prepareUxDialogPosition() {
  const rect = elements.uxDialog.getBoundingClientRect();
  applyUxDialogPosition({
    left: (window.innerWidth - rect.width) / 2,
    top: Math.max(48, (window.innerHeight - rect.height) / 2),
  });
}

function handleUxHeaderPointerDown(event) {
  if (!elements.uxDialog.open) {
    return;
  }
  if (event.button !== 0 || event.target.closest("button")) {
    return;
  }
  const rect = elements.uxDialog.getBoundingClientRect();
  state.uxDialogDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
  };
  elements.uxDialog.classList.add("dragging");
  event.preventDefault();
}

function handleUxHeaderPointerMove(event) {
  const drag = state.uxDialogDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  applyUxDialogPosition({
    left: drag.left + (event.clientX - drag.startX),
    top: drag.top + (event.clientY - drag.startY),
  });
}

function handleUxHeaderPointerUp(event) {
  const drag = state.uxDialogDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  state.uxDialogDrag = null;
  elements.uxDialog.classList.remove("dragging");
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
  pruneUiPreferencesForBoards();
  if (!state.activeBoardId && state.boards.length > 0) {
    state.activeBoardId = state.boards[0].id;
  } else if (state.activeBoardId && !state.boards.some((board) => board.id === state.activeBoardId)) {
    state.activeBoardId = state.boards[0]?.id ?? null;
  }
  restoreBoardViewMode(state.activeBoardId);
  restoreBoardFilters(state.activeBoardId);
  restoreBoardFilterExpansion(state.activeBoardId);
  persistUiPreferences();
  renderBoards();
  await refreshBoardDetail();
}

async function selectBoard(boardId) {
  saveBoardFilters();
  saveBoardFilterExpansion();
  saveBoardViewMode();
  state.activeBoardId = boardId;
  state.isRenamingBoard = false;
  state.boardRenameError = "";
  state.isCreatingSidebarTag = false;
  state.editingSidebarTagId = null;
  state.confirmingSidebarTagDeleteId = null;
  state.sidebarTagError = "";
  restoreBoardViewMode(boardId);
  restoreBoardFilters(boardId);
  restoreBoardFilterExpansion(boardId);
  await refreshBoardDetail();
  syncBoardUrl();
  persistUiPreferences();
}

async function refreshBoardDetail() {
  if (!state.activeBoardId) {
    closeBoardEvents();
    state.boardDetail = null;
    state.boardTickets = [];
    syncActiveFilterStyles();
    renderBoardDetail();
    return;
  }
  const detail = await api(`/api/boards/${state.activeBoardId}`);
  normalizeBoardFiltersForDetail(detail);
  const allTickets = await api(buildTicketListUrl());
  state.boardTickets = allTickets.tickets;
  state.boardDetail = {
    board: detail.board,
    lanes: detail.lanes,
    tags: detail.tags,
    tickets: filterTicketsForDisplay(allTickets.tickets),
  };
  syncBoardEvents();
  renderBoards();
  renderBoardDetail();
  syncActiveFilterStyles();
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
  if (!state.activeBoardId || state.viewMode !== "kanban") {
    return;
  }
  if (elements.editorDialog.open) {
    state.boardRefreshPendingAfterDialog = true;
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

async function flushPendingBoardRefreshAfterDialogClose() {
  if (!state.boardRefreshPendingAfterDialog || !state.activeBoardId || state.viewMode !== "kanban") {
    return;
  }
  state.boardRefreshPendingAfterDialog = false;
  await handleBoardUpdatedEvent();
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
      saveBoardFilters();
      saveBoardFilterExpansion();
      saveBoardViewMode();
      state.activeBoardId = ticket.boardId;
      restoreBoardViewMode(ticket.boardId);
      restoreBoardFilters(ticket.boardId);
      restoreBoardFilterExpansion(ticket.boardId);
      await refreshBoardDetail();
      await openEditor(ticket.id, "view");
      persistUiPreferences();
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
      saveBoardFilters();
      saveBoardFilterExpansion();
      saveBoardViewMode();
      state.activeBoardId = route.id;
      state.viewMode = route.viewMode;
      saveBoardViewMode(route.id, route.viewMode);
      restoreBoardFilters(route.id);
      restoreBoardFilterExpansion(route.id);
      await refreshBoardDetail();
      persistUiPreferences();
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
    saveBoardFilters();
    saveBoardFilterExpansion();
    saveBoardViewMode();
    state.activeBoardId =
      state.activeBoardId && state.boards.some((board) => board.id === state.activeBoardId)
        ? state.activeBoardId
        : state.boards[0].id;
    restoreBoardViewMode(state.activeBoardId);
    restoreBoardFilters(state.activeBoardId);
    restoreBoardFilterExpansion(state.activeBoardId);
    await refreshBoardDetail();
    persistUiPreferences();
    if (elements.editorDialog.open) {
      state.skipDialogCloseSync = true;
      elements.editorDialog.close();
    }
    syncBoardUrl(replace);
    return;
  }

  state.activeBoardId = null;
  state.viewMode = "kanban";
  persistUiPreferences();
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
  saveBoardViewMode();
  const pathname = !state.activeBoardId
    ? "/"
    : state.viewMode === "list"
      ? `/boards/${state.activeBoardId}/list`
      : `/boards/${state.activeBoardId}`;
  setUrl(pathname, { replace });
  persistUiPreferences();
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
  prepareUxDialogPosition,
  escapeHtml,
});

const { confirmAndRun, finishUxDialog, handleUxSubmit, openFormDialog, showToast } = uxModule;

const filtersModule = createFiltersModule(
  { state, elements },
  {
    persistUiPreferences,
    refreshBoardDetail,
    showToast,
    syncBoardUrl,
  },
);

const {
  bindFilterEvents,
  buildTicketListUrl,
  filterTicketsForDisplay,
  hasActiveTicketFilters,
  normalizeBoardFiltersForDetail,
  restoreBoardFilterExpansion,
  restoreBoardFilters,
  saveBoardFilterExpansion,
  saveBoardFilters,
  syncActiveFilterStyles,
  syncStatusFilter,
  syncViewMode,
} = filtersModule;

const editorModule = createEditorModule({
  state,
  elements,
  api,
  confirmAndRun,
  escapeHtml,
  ensureEditorDialogPosition,
  openFormDialog,
  prepareEditorDialogPosition,
  refreshBoardDetail,
  flushPendingBoardRefreshAfterDialogClose,
  sendJson,
  showToast,
  syncBoardUrl,
  syncDialogScrollLock,
  syncTicketUrl,
});

const {
  addComment,
  handleCommentAction,
  toggleCommentComposer,
  closeEditor,
  deleteTicket,
  moveTicketToBoard,
  handleBlockerFieldClick,
  handleBlockerSearchInput,
  handleBlockerSearchKeydown,
  handleChildFieldClick,
  handleChildSearchInput,
  handleChildSearchKeydown,
  handleDocumentClick,
  handleDetailChange,
  handleDetailClick,
  handleDetailFocusout,
  handleDetailKeydown,
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
  restoreBoardFilterExpansion,
  restoreBoardFilters,
  restoreBoardViewMode,
  saveBoardFilterExpansion,
  saveBoardFilters,
  saveBoardViewMode,
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
