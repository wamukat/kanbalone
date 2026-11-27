import { createBoardKeyboardModule } from "./app-board-keyboard.js";
import { t as tr } from "./app-i18n.js";
import { renderTicketStatusIcons } from "./app-ticket-status.js";
import { createListBoardModule } from "./app-board-list.js";
import { createBoardSettingsModule } from "./app-board-settings.js";
import { createKanbanBoardModule } from "./app-kanban-board.js";
import { createSidebarBoardsModule } from "./app-sidebar-boards.js";
import { createSidebarTagsModule } from "./app-sidebar-tags.js";
import { createGroupBoardModule } from "./app-group-board.js";
import { icon } from "./icons.js";

export function createBoardModule(ctx) {
  const { state, elements } = ctx;
  const listModule = createListBoardModule(
    { ...ctx, renderBoardDetail },
    { hasActiveTicketFilters: ctx.hasActiveTicketFilters, renderEmptyState, renderTicketStatusIcons },
  );
  const keyboard = createBoardKeyboardModule(ctx, listModule, {
    onKanbanKeyboardScroll: (list) => kanbanModule.stopKeyboardScrollRestore(list),
    findKanbanTitle: (id, scroll) => kanbanModule.findKanbanTitle(id, scroll),
    firstKanbanTitle: () => kanbanModule.firstKanbanTitle(),
    kanbanNeighbor: (list, id, direction) => kanbanModule.kanbanNeighbor(list, id, direction),
    captureKanbanAnchor: (list) => kanbanModule.captureWindowAnchor(list),
    restoreKanbanAnchor: (list, anchor) => kanbanModule.restoreWindowAnchor(list, anchor),
    captureGroupAnchor: () => groupModule.captureTicketAnchor(),
    restoreGroupAnchor: (anchor) => groupModule.restoreTicketAnchor(anchor),
    groupScope: () => groupModule.renderedScope(),
    captureGroupTicketFocus: () => groupModule.captureEditorTicketFocus(),
    focusGroupEditorTicket: (origin) => groupModule.focusEditorTicket(origin),
  });
  const boardSettingsModule = createBoardSettingsModule(ctx);
  const kanbanModule = createKanbanBoardModule(ctx, { renderBoardDetail, afterRender: keyboard.afterRender });
  const sidebarBoardsModule = createSidebarBoardsModule(ctx, {
    syncSidebar: boardSettingsModule.syncSidebar,
    cancelLaneCreate: kanbanModule.cancelLaneCreate,
  });
  const sidebarTagsModule = createSidebarTagsModule(ctx);
  const groupModule = createGroupBoardModule({ ...ctx, beforeGroupRender: keyboard.beforeRender, afterGroupRender: keyboard.afterRender });

  function renderEmptyState({ iconName, title, body, actionLabel = "", actionAttr = "", actionIcon = "plus" }) {
    const action = actionLabel && actionAttr
      ? `<button type="button" class="empty-state-action action-with-icon" ${actionAttr}>${icon(actionIcon)}<span>${actionLabel}</span></button>`
      : "";
    return `
      <div class="empty-state">
        <span class="empty-state-icon">${icon(iconName)}</span>
        <strong>${ctx.escapeHtml(title)}</strong>
        <p>${ctx.escapeHtml(body)}</p>
        ${action}
      </div>
    `;
  }

  function renderBoardDetail({ reuseReadyKanbanLanes = false } = {}) {
    keyboard.beforeRender();
    const detail = state.boardDetail;
    if (!detail) {
      elements.boardTitle.textContent = tr("No board selected");
      elements.sidebarTagSection.hidden = true;
      elements.sidebarBoardSection.hidden = false;
      state.isRenamingBoard = false;
      state.boardRenameError = "";
      state.isCreatingLane = false;
      state.isCreatingSidebarTag = false;
      state.editingSidebarTagId = null;
      state.confirmingSidebarTagDeleteId = null;
      state.sidebarTagError = "";
      boardSettingsModule.syncBoardSettingsPanel();
      elements.tagFilter.innerHTML = `<option value="">${tr("All tags")}</option>`;
      elements.laneFilter.innerHTML = `<option value="">${tr("All lanes")}</option>`;
      elements.laneBoard.className = "lane-board empty";
      elements.laneBoard.innerHTML = renderEmptyState({
        iconName: "columns-3",
        title: tr("No boards yet"),
        body: tr("Use the + button in the sidebar to create your first board."),
      });
      elements.groupBoard.innerHTML = "";
      elements.listBoard.className = "list-board empty";
      elements.listBoard.innerHTML = renderEmptyState({
        iconName: "columns-3",
        title: tr("No boards yet"),
        body: tr("Use the + button in the sidebar to create your first board."),
      });
      state.selectedListTicketIds = [];
      kanbanModule.cancelPendingRender();
      listModule.reset();
      ctx.syncViewMode();
      return;
    }

    elements.boardTitle.textContent = detail.board.name;
    elements.sidebarTagSection.hidden = false;
    elements.sidebarBoardSection.hidden = false;
    boardSettingsModule.syncBoardSettingsPanel();
    sidebarTagsModule.renderSidebarTags();
    elements.tagFilter.innerHTML =
      `<option value="">${tr("All tags")}</option>` +
      detail.tags
        .map(
          (tag) =>
            `<option value="${ctx.escapeHtml(tag.name)}" ${state.filters.tag === tag.name ? "selected" : ""}>${ctx.escapeHtml(tag.name)}</option>`,
        )
        .join("");
    elements.laneFilter.innerHTML =
      `<option value="">${tr("All lanes")}</option>` +
      detail.lanes
        .map(
          (lane) =>
            `<option value="${lane.id}" ${state.filters.lane === String(lane.id) ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`,
        )
        .join("");

    let groupLoad;
    if (state.viewMode === "kanban") {
      kanbanModule.renderKanbanBoard(detail, { reuseReadyLanes: reuseReadyKanbanLanes });
    } else if (state.viewMode === "group") {
      kanbanModule.cancelPendingRender();
      groupLoad = groupModule.renderGroupBoard();
    } else {
      kanbanModule.cancelPendingRender();
      listModule.renderListBoard(detail);
    }
    ctx.syncViewMode();
    keyboard.afterRender();
    return groupLoad;
  }

  elements.boardList.addEventListener("dragover", sidebarBoardsModule.handleBoardListDragOver);
  elements.listBoard.addEventListener("click", listModule.handleListBoardClick);
  elements.listBoard.addEventListener("change", listModule.handleListBoardChange);
  elements.listBoard.addEventListener("scroll", listModule.handleListBoardScroll, true);

  return {
    captureEditorOrigin: keyboard.captureEditorOrigin,
    restoreEditorOrigin: keyboard.restoreEditorOrigin,
    afterKeyboardRender: keyboard.afterRender,
    openGroup: groupModule.openGroup,
    isActiveGroup: groupModule.isActiveGroup,
    renderBoards: sidebarBoardsModule.renderBoards,
    renderBoardDetail,
    renderSidebarTags: sidebarTagsModule.renderSidebarTags,
    handleLaneDragOver: kanbanModule.handleLaneDragOver,
    createBoard: sidebarBoardsModule.createBoard,
    createLane: kanbanModule.createLane,
    onTicketCreated: boardSettingsModule.onTicketCreated,
    deleteBoard: boardSettingsModule.deleteBoard,
    createTag: sidebarTagsModule.createTag,
    renameLane: kanbanModule.renameLane,
    deleteLane: kanbanModule.deleteLane,
    exportBoard: boardSettingsModule.exportBoard,
    importBoard: boardSettingsModule.importBoard,
    importRemoteIssue: boardSettingsModule.importRemoteIssue,
    toggleSidebar: boardSettingsModule.toggleSidebar,
    toggleBoardSettings: boardSettingsModule.toggleBoardSettings,
    syncSidebar: boardSettingsModule.syncSidebar,
  };
}
