import { getLocale, initializeLanguage, saveLocale, t } from "./app-i18n.js";
import { loadKanbanTicketCollections, loadListTicketCollection } from "./app-ticket-collections.js";
import { readTicketPage, ticketPageUrl } from "./app-ticket-pages.js";
import { api, createSendJson } from "./app-api.js";
import { createBoardEventsModule } from "./app-board-events.js";
import { createBoardModule } from "./app-board.js";
import { createCustomViews } from "./app-custom-views.js";
import { createDialogModule } from "./app-dialogs.js";
import { getAppElements } from "./app-elements.js";
import { bindOperationUpdaterSettings } from "./app-operation-updater.js";
import { createEditorModule } from "./app-editor.js";
import { createFiltersModule } from "./app-filters.js";
import { createUiPreferencesController, saveEditorDialogSize } from "./app-preferences.js";
import { createRouterModule } from "./app-router.js";
import { createAppState } from "./app-state.js";
import { createUxModule } from "./app-ux.js";

initializeLanguage();
const state = createAppState();

const {
  persistUiPreferences,
  pruneUiPreferencesForBoards,
  saveBoardViewMode,
  restoreBoardViewMode,
} = createUiPreferencesController(state);

const elements = getAppElements();

const {
  fitEditorDialogToViewport,
  handleEditorDialogResizePointerDown,
  handleEditorDialogResizePointerMove,
  handleEditorDialogResizePointerUp,
  handleEditorHeaderPointerDown,
  handleEditorHeaderPointerMove,
  handleEditorHeaderPointerUp,
  handleUxHeaderPointerDown,
  handleUxHeaderPointerMove,
  handleUxHeaderPointerUp,
  prepareEditorDialogPosition,
  prepareUxDialogPosition,
  syncDialogScrollLock,
} = createDialogModule({ state, elements }, { saveEditorDialogSize });

async function main() {
  bindEvents();
  await loadAppMeta();
  syncSidebar();
  syncViewMode();
  syncActiveFilterStyles();
  // Resolve the requested route before loading its board, rather than loading
  // the remembered/default board and immediately fetching again in the router.
  await refreshBoards({ refreshDetail: false });
  void customViews.loadLinks().catch(error => showToast(error.message, "error"));
  await applyRouteFromLocation({ replace: true });
}

async function loadAppMeta() {
  try {
    const meta = await api("/api/meta");
    elements.footerAppLabel.textContent = `${meta.name} (v${meta.version})`;
    editorModule.setRemoteProviderAvailability?.(meta.remoteProviders ?? []);
  } catch (error) {
    console.warn("Failed to load app metadata", error);
  }
}

function bindEvents() {
  const hasUpdaterDraft = bindOperationUpdaterSettings();
  const languageSelect = document.querySelector("#language-select");
  languageSelect.value = getLocale();
  languageSelect.addEventListener("change", async () => {
    const selected = languageSelect.value;
    if (selected === getLocale()) return;
    languageSelect.focus();
    if (!await confirmDiscardChanges()) {
      languageSelect.value = getLocale();
      return;
    }
    // Inline board/Group forms are outside the ticket dialog. Reloading must not
    // silently lose these drafts (including selections without a text field).
    const inlineEditing = [...document.querySelectorAll(".sidebar form, .main form, .completion-options")]
      .some((element) => element.getClientRects().length > 0 && (element.id !== "operation-updater-form" || hasUpdaterDraft()));
    if (inlineEditing && !await openFormDialog({
      title: t("Change language?"),
      message: t("Changing language reloads the page. Unsaved edits will be discarded."),
      submitLabel: t("Change language"),
    })) {
      languageSelect.value = getLocale();
      return;
    }
    if (!saveLocale(selected)) {
      languageSelect.value = getLocale();
      showToast(t("Language settings could not be saved. Allow browser storage and try again."), "error");
      return;
    }
    window.location.reload();
  });
  elements.sidebarToggleButton.addEventListener("click", toggleSidebar);
  elements.sidebarReopenButton.addEventListener("click", toggleSidebar);
  elements.newBoardButton.addEventListener("click", async () => {
    if (customViews.active) {
      if (!await customViews.mayLeave()) return;
      await returnToBoard();
    }
    createBoard();
  });
  elements.newSidebarTagButton.addEventListener("click", createTag);
  elements.boardSettingsToggleButton.addEventListener("click", toggleBoardSettings);
  elements.deleteBoardButton.addEventListener("click", deleteBoard);
  elements.ticketTagToggle.addEventListener("click", handleTicketTagFieldClick);
  elements.ticketTagSearch.addEventListener("input", handleTicketTagSearchInput);
  elements.ticketTagSearch.addEventListener("keydown", handleTicketTagSearchKeydown);
  elements.ticketRelationAddButton.addEventListener("click", handleAddRelation);
  elements.ticketRelationAddOptions.addEventListener("click", handleAddRelationTypeClick);
  elements.ticketBlockerToggle.addEventListener("click", handleBlockerFieldClick);
  elements.ticketBlockerSearch.addEventListener("input", handleBlockerSearchInput);
  elements.ticketBlockerSearch.addEventListener("keydown", handleBlockerSearchKeydown);
  elements.ticketRelatedToggle.addEventListener("click", handleRelatedFieldClick);
  elements.ticketRelatedSearch.addEventListener("input", handleRelatedSearchInput);
  elements.ticketRelatedSearch.addEventListener("keydown", handleRelatedSearchKeydown);
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
  elements.remoteImportCreateButton.addEventListener("click", openRemoteImportSheet);
  elements.editorRemoteProviderSwitch.addEventListener("click", handleRemoteImportProviderClick);
  elements.editorRemoteImportCloseButton.addEventListener("click", closeRemoteImportSheet);
  elements.editorRemoteImportCancelButton.addEventListener("click", closeRemoteImportSheet);
  elements.editorRemoteImportPreviewButton.addEventListener("click", previewRemoteImport);
  elements.editorRemoteUrl.addEventListener("input", handleRemoteImportInputChange);
  elements.editorRemoteLane.addEventListener("change", handleRemoteImportInputChange);
  elements.editorRemoteBacklinkComment.addEventListener("change", handleRemoteBacklinkToggle);
  elements.editorRemoteImportForm.addEventListener("submit", submitRemoteImport);
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
  elements.ticketEditLocalBodyTabButton.addEventListener("click", () => setEditBodyTab("local"));
  elements.ticketEditRemoteBodyTabButton.addEventListener("click", () => setEditBodyTab("remote"));
  elements.editorHeader.addEventListener("pointerdown", handleEditorHeaderPointerDown);
  elements.editorDialogResizeHandle.addEventListener("pointerdown", handleEditorDialogResizePointerDown);
  elements.uxHeader.addEventListener("pointerdown", handleUxHeaderPointerDown);
  elements.uxForm.addEventListener("submit", handleUxSubmit);
  elements.deleteTicketButton.addEventListener("click", deleteTicket);
  elements.archiveTicketButton.addEventListener("click", toggleTicketArchive);
  elements.moveTicketButton.addEventListener("click", moveTicketToBoard);
  elements.headerEditButton.addEventListener("click", async () => {
    if (!await confirmDiscardChanges()) return;
    setDialogMode("edit");
    elements.editorDialog.querySelector(".editor-scroll").scrollTop = 0;
    const field = elements.ticketTitle.disabled ? elements.ticketBody : elements.ticketTitle;
    field.focus({ preventScroll: true });
  });
  elements.cancelEditButton.addEventListener("click", cancelEditorEdit);
  elements.editorDialog.addEventListener("close", () => {
    if (elements.editorDialog.open) return;
    state.editorDialogDrag = null;
    state.editorDialogResize = null;
    elements.editorDialog.classList.remove("dragging", "resizing");
    handleEditorDialogClose();
    syncDialogScrollLock();
  });
  bindEditorBackdrop();
  elements.uxCancelButton.addEventListener("click", () => finishUxDialog(null));
  elements.uxDismissButton.addEventListener("click", () => finishUxDialog(null));
  elements.uxDialog.addEventListener("close", () => {
    if (elements.uxDialog.open) return;
    state.uxDialogDrag = null;
    elements.uxDialog.classList.remove("dragging");
    finishUxDialog(null);
    syncDialogScrollLock();
  });
  elements.uxDialog.addEventListener("click", handleDialogBackdropClick);
  elements.exportBoardButton.addEventListener("click", exportBoard);
  elements.importBoardInput.addEventListener("change", importBoard);
  elements.laneBoard.addEventListener("dragover", handleLaneDragOver);
  window.addEventListener("beforeunload", (event) => {
    if (hasUnsavedChanges() || state.editorSaving || customViews.isDirty()) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("popstate", async () => {
    if (!await confirmDiscardChanges() || !await customViews.mayLeave()) {
      if (state.editingTicketId) syncTicketUrl(state.editingTicketId, { replace: true });
      else syncBoardUrl(true);
      return;
    }
    applyRouteFromLocation().catch((error) => {
      console.error(error);
      showToast(error.message, "error");
    });
  });
  window.addEventListener("pointermove", handleEditorHeaderPointerMove);
  window.addEventListener("pointerup", handleEditorHeaderPointerUp);
  window.addEventListener("pointercancel", handleEditorHeaderPointerUp);
  window.addEventListener("pointermove", handleEditorDialogResizePointerMove);
  window.addEventListener("pointerup", handleEditorDialogResizePointerUp);
  window.addEventListener("pointercancel", handleEditorDialogResizePointerUp);
  window.addEventListener("resize", fitEditorDialogToViewport);
  window.addEventListener("pointermove", handleUxHeaderPointerMove);
  window.addEventListener("pointerup", handleUxHeaderPointerUp);
  document.addEventListener("click", handleDocumentClick);
}

function isDialogBackdrop(event, dialog) {
  if (event.target !== dialog) return false;
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX >= rect.right
    || event.clientY < rect.top || event.clientY >= rect.bottom;
}

function bindEditorBackdrop() {
  const dialog = elements.editorDialog;
  let backdropPointer = null;
  dialog.addEventListener("pointerdown", (event) => {
    backdropPointer = event.isPrimary && event.button === 0 && isDialogBackdrop(event, dialog) ? event.pointerId : null;
    // Preserve the current field and selection for the discard confirmation.
    if (backdropPointer !== null) event.preventDefault();
  });
  dialog.addEventListener("pointerup", (event) => {
    if (event.pointerId === backdropPointer && !isDialogBackdrop(event, dialog)) backdropPointer = null;
  });
  dialog.addEventListener("pointercancel", () => { backdropPointer = null; });
  dialog.addEventListener("close", () => { backdropPointer = null; });
  dialog.addEventListener("click", (event) => {
    const startedOutside = backdropPointer !== null;
    backdropPointer = null;
    if (!startedOutside || !event.detail || !isDialogBackdrop(event, dialog) || elements.uxDialog.open) return;
    if (state.editorRemoteImportOpen) closeRemoteImportSheet();
    else requestCloseEditor();
  });
}

function handleDialogBackdropClick(event) {
  if (isDialogBackdrop(event, elements.uxDialog)) finishUxDialog(null);
}

async function refreshBoards({ refreshDetail = true } = {}) {
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
  if (refreshDetail) await refreshBoardDetail();
}

async function selectBoard(boardId) {
  if (customViews.active) {
    if (!await customViews.mayLeave()) return;
    customViews.leave();
  }
  ++routeGeneration;
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
  if (state.activeBoardId === boardId && !customViews.active) {
    syncBoardUrl();
    persistUiPreferences();
  }
}

let boardRefreshGeneration = 0;
let boardRefreshAbort = null;
let completionQueryKey = "";
let successfulBoardContext = null;
const boardRequestContext = () => JSON.stringify([state.activeBoardId, state.viewMode, state.filters]);
const completionRequested = new Map();

async function loadMoreCompletionTickets(laneId) {
  const detail = state.boardDetail;
  const current = detail?.completionPages?.[laneId];
  const generation = boardRefreshGeneration;
  if (!current || !current.nextCursor) return null;
  const wanted = current.tickets.length + 50;
  try {
    const result = readTicketPage(await api(ticketPageUrl(current.url, 50, current.nextCursor)));
    if (state.boardDetail !== detail || generation !== boardRefreshGeneration || state.viewMode !== "kanban") return null;
    current.tickets.push(...result.tickets);
    current.total = result.page.total;
    current.nextCursor = result.page.nextCursor;
    detail.tickets.push(...result.tickets);
    const ids = new Set(state.boardTickets.map((ticket) => ticket.id));
    state.boardTickets.push(...result.tickets.filter((ticket) => !ids.has(ticket.id)));
    completionRequested.set(laneId, wanted);
    return result;
  } catch (error) {
    if (state.boardDetail !== detail || generation !== boardRefreshGeneration || state.viewMode !== "kanban") return null;
    if (error.status !== 409) throw error;
    const previous = completionRequested.get(laneId);
    completionRequested.set(laneId, wanted);
    try { await refreshBoardDetail(); }
    catch (retryError) {
      if (previous === undefined) completionRequested.delete(laneId);
      else completionRequested.set(laneId, previous);
      throw retryError;
    }
    return null;
  }
}

function collapseCompletionTickets(laneId, count = 5) {
  completionRequested.set(laneId, count);
  const current = state.boardDetail?.completionPages?.[laneId];
  if (current) current.visibleCount = count;
}

async function refreshBoardDetail({ awaitGroupLoad = false, reuseReadyKanbanLanes = false } = {}) {
  if (customViews.active) {
    const owner = state.activeBoardId;
    if (elements.editorDialog.open && owner) {
      const marker = customViews.origin;
      const board = await api(`/api/boards/${owner}`);
      if (customViews.active && customViews.origin === marker && owner === state.activeBoardId && elements.editorDialog.open) {
        state.boardDetail = { ...board, tickets: [] };
      }
    }
    return;
  }
  const generation = ++boardRefreshGeneration;
  boardRefreshAbort?.abort();
  boardRefreshAbort = new AbortController();
  const signal = boardRefreshAbort.signal;
  state.boardNavigationLoading = true;
  state.boardNavigationReady = false;
  let groupLoad;
  try {
    if (!state.activeBoardId) {
      closeBoardEvents();
      state.boardDetail = null;
      state.boardTickets = [];
      clearBoardFilterChoices();
      syncActiveFilterStyles();
      renderBoardDetail();
      return;
    }
    const boardId = state.activeBoardId;
    const viewMode = state.viewMode;
    syncBoardEvents();
    const detail = await api(`/api/boards/${boardId}`, { signal });
    if (generation !== boardRefreshGeneration || boardId !== state.activeBoardId || viewMode !== state.viewMode) return;
    normalizeBoardFiltersForDetail(detail);
    const url = buildTicketListUrl();
    // Keep cache cleanup tied to the request that produced this board detail.
    const hasDefaultKanbanTickets = viewMode === "kanban" && !url.includes("?");
    if (url !== completionQueryKey) {
      completionRequested.clear();
      completionQueryKey = url;
    }
    const isCurrent = () => generation === boardRefreshGeneration && boardId === state.activeBoardId && viewMode === state.viewMode;
    const allTickets = viewMode === "group"
      ? { tickets: [], completionPages: {} }
      : viewMode === "kanban"
        ? await loadKanbanTicketCollections(api, detail.lanes, url, { limits: completionRequested, isCurrent, signal })
        : await loadListTicketCollection(api, url, { isCurrent, signal, allReferences: () => elements.editorDialog.open });
    if (generation !== boardRefreshGeneration || boardId !== state.activeBoardId || viewMode !== state.viewMode) return;
    state.boardTickets = allTickets.referenceTickets ?? allTickets.tickets;
    state.boardDetail = {
      board: detail.board,
      lanes: detail.lanes,
      tags: detail.tags,
      tickets: filterTicketsForDisplay(allTickets.tickets),
      completionPages: allTickets.completionPages,
      hasDefaultKanbanTickets,
    };
    state.boardNavigationReady = true;
    successfulBoardContext = boardRequestContext();
    syncBoardEvents();
    renderBoards();
    groupLoad = renderBoardDetail({ reuseReadyKanbanLanes });
    syncActiveFilterStyles();
  } catch (error) {
    if (generation === boardRefreshGeneration) {
      state.boardNavigationReady = successfulBoardContext === boardRequestContext();
      throw error;
    }
  } finally {
    if (generation === boardRefreshGeneration) {
      state.boardNavigationLoading = false;
      boardModule.afterKeyboardRender();
    }
  }
  if (awaitGroupLoad) await groupLoad;
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

const { confirmAndRun, finishUxDialog, handleUxSubmit, openFormDialog, openConfirmDialog, showToast } = uxModule;

let routerModule;

let routeGeneration = 0;
let boardBeforeView;
let returningInHistory = false;

function beginBoardOverride() {
  closeBoardFilterPickers();
  editorModule.invalidateOpening();
  ++routeGeneration;
  ++boardRefreshGeneration;
  boardRefreshAbort?.abort();
  closeBoardEvents();
  state.boardRefreshPendingAfterDialog = false;
  boardBeforeView = { activeBoardId: state.activeBoardId, boardDetail: state.boardDetail, boardTickets: state.boardTickets };
  state.boardDetail = null;
  state.boardTickets = [];
  elements.shell.classList.add("custom-view-active");
  renderBoards();
}

function endBoardOverride() {
  editorModule.invalidateOpening();
  ++routeGeneration;
  Object.assign(state, boardBeforeView);
  boardBeforeView = null;
  elements.shell.classList.remove("custom-view-active");
  renderBoards();
}

async function returnToBoard() {
  customViews.leave();
  await refreshBoards();
  syncBoardUrl(true);
  document.querySelector(".board-button.active, #new-board-button")?.focus();
}

async function applyRouteFromLocation(options) {
  closeBoardFilterPickers();
  returningInHistory = false;
  const path = location.pathname;
  const viewRoute = /^\/views\/(new|[1-9]\d*)\/?$/.exec(path);
  const ticketRoute = /^\/tickets\/([1-9]\d*)\/?$/.exec(path);
  const historyView = ticketRoute && history.state?.customViewId;
  if (viewRoute || historyView) {
    const viewId = viewRoute ? (viewRoute[1] === "new" ? null : Number(viewRoute[1])) : Number(historyView);
    if (elements.editorDialog.open) {
      state.skipDialogCloseSync = true;
      elements.editorDialog.close();
    }
    if (!customViews.active || customViews.id !== viewId) await customViews.enter(viewId, { writeUrl: false });
    if (location.pathname !== path || !customViews.active || customViews.id !== viewId) return;
    if (historyView) {
      const ticket = await api(`/api/tickets/${Number(ticketRoute[1])}`);
      if (location.pathname === path && customViews.active && customViews.id === viewId) await customViews.openTicket(ticket.id, ticket.boardId);
    }
    return;
  }
  customViews.leave();
  const generation = ++routeGeneration;
  return routerModule.applyRouteFromLocation({ ...options, isCurrent: () => generation === routeGeneration });
}

function syncBoardUrl(replace = false) {
  if (customViews.active) {
    if (!replace && !returningInHistory && history.state?.returnToCustomView && location.pathname.startsWith("/tickets/")) {
      returningInHistory = true;
      history.back();
    } else if (!returningInHistory) customViews.setPath(customViews.currentPath(), true);
    return;
  }
  return routerModule.syncBoardUrl(replace);
}

function syncTicketUrl(ticketId, options) {
  if (customViews.active) {
    const linked = location.pathname.startsWith("/tickets/") && history.state?.customViewId === customViews.id;
    return customViews.setPath(`/tickets/${ticketId}`, options?.replace || linked, {
      customViewId: customViews.id,
      returnToCustomView: !options?.replace && (location.pathname === customViews.currentPath() || linked && history.state?.returnToCustomView),
    });
  }
  return routerModule.syncTicketUrl(ticketId, options);
}

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
  clearBoardFilterChoices,
  closeBoardFilterPickers,
  filterTicketsForDisplay,
  hasActiveTicketFilters,
  normalizeBoardFiltersForDetail,
  restoreBoardFilterExpansion,
  restoreBoardFilters,
  saveBoardFilterExpansion,
  saveBoardFilters,
  syncActiveFilterStyles,
  syncViewMode,
} = filtersModule;

const {
  closeBoardEvents,
  flushPendingBoardRefreshAfterDialogClose,
  syncBoardEvents,
} = createBoardEventsModule(
  { state, elements },
  {
    refreshBoardDetail,
    refreshTicketTasks: () => editorModule.refreshTicketTasks(),
  },
);

const editorModule = createEditorModule({
  isActiveGroup: (groupId) => boardModule.isActiveGroup(groupId),
  isCustomView: () => customViews.active,
  captureEditorOrigin: () => customViews.active ? customViews.origin : boardModule.captureEditorOrigin(),
  restoreEditorOrigin: (version) => customViews.active ? Boolean(version?.viewId) : boardModule.restoreEditorOrigin(version),
  onTicketCreated: (boardId) => boardModule.onTicketCreated(boardId),
  openGroup: async (groupId) => {
    if (customViews.active) {
      if (!await confirmDiscardChanges()) return;
      const owner = state.activeBoardId;
      // Group navigation owns the next URL. Closing the view ticket must not
      // enqueue history.back() after the Group route has been selected.
      state.skipDialogCloseSync = true;
      elements.editorDialog.close();
      customViews.leave();
      restoreBoardFilters(owner);
      restoreBoardFilterExpansion(owner);
    }
    await boardModule.openGroup(groupId);
  },
  state,
  elements,
  api,
  confirmAndRun,
  escapeHtml,
  openFormDialog,
  prepareEditorDialogPosition,
  refreshBoardDetail,
  flushPendingBoardRefreshAfterDialogClose: () => customViews.active ? customViews.returned() : flushPendingBoardRefreshAfterDialogClose(),
  sendJson,
  showToast,
  syncBoardUrl,
  syncDialogScrollLock,
  syncTicketUrl,
});

const {
  hasUnsavedChanges,
  confirmDiscardChanges,
  requestCloseEditor,
  cancelEditorEdit,
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
  handleAddRelation,
  handleAddRelationTypeClick,
  handleParentChange,
  handleParentFieldClick,
  handleParentSearchInput,
  handleParentSearchKeydown,
  handleRelatedFieldClick,
  handleRelatedSearchInput,
  handleRelatedSearchKeydown,
  handleRemoteBacklinkToggle,
  handleRemoteImportInputChange,
  handleRemoteImportProviderClick,
  handleTicketTagSearchInput,
  handleTicketTagSearchKeydown,
  handleTicketTagFieldClick,
  openBlockerOptions,
  openChildOptions,
  openEditor,
  openParentOptions,
  openRelatedOptions,
  openTicketTagOptions,
  previewRemoteImport,
  saveTicket,
  submitRemoteImport,
  setEditBodyTab,
  setDetailTab,
  setDialogMode,
  openRemoteImportSheet,
  closeRemoteImportSheet,
  syncTicketTagOptions,
  toggleTicketArchive,
} = editorModule;

routerModule = createRouterModule(
  { state, elements, api },
  {
    openEditor,
    persistUiPreferences,
    refreshBoardDetail,
    restoreBoardFilterExpansion,
    restoreBoardFilters,
    restoreBoardViewMode,
    saveBoardFilterExpansion,
    saveBoardFilters,
    saveBoardViewMode,
    showToast,
  },
);

const boardModule = createBoardModule({
  hasActiveTicketFilters,
  loadMoreCompletionTickets,
  collapseCompletionTickets,
  state,
  elements,
  api,
  confirmAndRun,
  escapeHtml,
  openFormDialog,
  openConfirmDialog,
  finishUxDialog,
  openEditor,
  closeEditor,
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

const customViews = createCustomViews({
  api, sendJson, escapeHtml, elements, state, showToast, confirmAndRun,
  beginBoardOverride, endBoardOverride, returnToBoard, requestCloseEditor, confirmDiscardChanges,
  openEditor: (ticketId, isCurrent) => openEditor(ticketId, "view", null, null, isCurrent),
});

main().catch((error) => {
  console.error(error);
  showToast(error.message, "error");
});
