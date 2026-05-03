import { api, createSendJson } from "./app-api.js";
import { createBoardEventsModule } from "./app-board-events.js";
import { createBoardModule } from "./app-board.js";
import { createDialogModule } from "./app-dialogs.js";
import { getAppElements } from "./app-elements.js";
import { createEditorModule } from "./app-editor.js";
import { createFiltersModule } from "./app-filters.js";
import { createUiPreferencesController, saveEditorDialogSize } from "./app-preferences.js";
import { createRouterModule } from "./app-router.js";
import { createAppState } from "./app-state.js";
import { createUxModule } from "./app-ux.js";

const state = createAppState();

const {
  persistUiPreferences,
  pruneUiPreferencesForBoards,
  saveBoardViewMode,
  restoreBoardViewMode,
} = createUiPreferencesController(state);

const elements = getAppElements();

const {
  ensureEditorDialogPosition,
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
    editorModule.setRemoteProviderAvailability?.(meta.remoteProviders ?? []);
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
  elements.saveCommentButton.addEventListener("click", addComment);
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
  elements.headerEditButton.addEventListener("click", () => setDialogMode("edit"));
  elements.cancelEditButton.addEventListener("click", () => {
    if (state.editingTicketId) {
      setDialogMode("view");
      return;
    }
    closeEditor();
  });
  elements.editorDialog.addEventListener("close", () => {
    state.editorDialogResize = null;
    elements.editorDialog.classList.remove("resizing");
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
  window.addEventListener("pointermove", handleEditorDialogResizePointerMove);
  window.addEventListener("pointerup", handleEditorDialogResizePointerUp);
  window.addEventListener("pointermove", handleUxHeaderPointerMove);
  window.addEventListener("pointerup", handleUxHeaderPointerUp);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
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
  if (state.editorRemoteImportOpen) {
    closeRemoteImportSheet();
    return;
  }
  closeEditor();
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

let routerModule;

function applyRouteFromLocation(options) {
  return routerModule.applyRouteFromLocation(options);
}

function syncBoardUrl(replace = false) {
  return routerModule.syncBoardUrl(replace);
}

function syncTicketUrl(ticketId, options) {
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

const {
  closeBoardEvents,
  flushPendingBoardRefreshAfterDialogClose,
  syncBoardEvents,
} = createBoardEventsModule(
  { state, elements },
  {
    refreshBoardDetail,
  },
);

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
  state,
  elements,
  api,
  confirmAndRun,
  escapeHtml,
  openFormDialog,
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
