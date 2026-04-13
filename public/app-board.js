import { createListBoardModule } from "./app-board-list.js";
import { createBoardSettingsModule } from "./app-board-settings.js";
import { createKanbanBoardModule } from "./app-kanban-board.js";
import { createSidebarBoardsModule } from "./app-sidebar-boards.js";
import { createSidebarTagsModule } from "./app-sidebar-tags.js";
import { icon } from "./icons.js";

export function createBoardModule(ctx) {
  const { state, elements } = ctx;
  const listModule = createListBoardModule(
    { ...ctx, renderBoardDetail },
    { hasUserTicketFilters, renderEmptyState, renderTicketStatusIcons },
  );
  const boardSettingsModule = createBoardSettingsModule(ctx);
  const kanbanModule = createKanbanBoardModule(ctx, { renderBoardDetail });
  const sidebarBoardsModule = createSidebarBoardsModule(ctx, {
    syncSidebar: boardSettingsModule.syncSidebar,
    cancelLaneCreate: kanbanModule.cancelLaneCreate,
  });
  const sidebarTagsModule = createSidebarTagsModule(ctx);

  function renderEmptyState({ iconName, title, body, actionLabel = "", actionAttr = "" }) {
    const action = actionLabel && actionAttr
      ? `<button type="button" class="empty-state-action action-with-icon" ${actionAttr}>${icon("plus")}<span>${actionLabel}</span></button>`
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

  function renderBoardDetail() {
    const detail = state.boardDetail;
    if (!detail) {
      elements.boardTitle.textContent = "No board selected";
      elements.sidebarTagSection.hidden = true;
      elements.sidebarBoardSection.hidden = true;
      state.boardSettingsExpanded = false;
      state.isCreatingLane = false;
      boardSettingsModule.syncBoardSettingsPanel();
      elements.tagFilter.innerHTML = '<option value="">All tags</option>';
      elements.laneFilter.innerHTML = '<option value="">All lanes</option>';
      elements.laneBoard.className = "lane-board empty";
      elements.laneBoard.innerHTML = renderEmptyState({
        iconName: "columns-3",
        title: "No boards yet",
        body: "Use the + button in the sidebar to create your first board.",
      });
      elements.listBoard.className = "list-board empty";
      elements.listBoard.innerHTML = renderEmptyState({
        iconName: "columns-3",
        title: "No boards yet",
        body: "Use the + button in the sidebar to create your first board.",
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
      '<option value="">All tags</option>' +
      detail.tags
        .map(
          (tag) =>
            `<option value="${ctx.escapeHtml(tag.name)}" ${state.filters.tag === tag.name ? "selected" : ""}>${ctx.escapeHtml(tag.name)}</option>`,
        )
        .join("");
    elements.laneFilter.innerHTML =
      '<option value="">All lanes</option>' +
      detail.lanes
        .map(
          (lane) =>
            `<option value="${lane.id}" ${state.filters.lane === String(lane.id) ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`,
        )
        .join("");

    if (state.viewMode === "kanban") {
      kanbanModule.renderKanbanBoard(detail);
    } else {
      kanbanModule.cancelPendingRender();
      listModule.renderListBoard(detail);
    }
    ctx.syncViewMode();
  }

  function hasUserTicketFilters() {
    return state.filters.q !== ""
      || (state.viewMode === "list" && state.filters.lane !== "")
      || state.filters.tag !== ""
      || (state.filters.resolved !== "" && state.filters.resolved !== "false");
  }

  function renderTicketStatusIcons(ticket) {
    return [
      ticket.isResolved
        ? `<span class="ticket-status-icon ticket-status-icon-resolved" title="Resolved" aria-label="Resolved">${icon("check")}</span>`
        : "",
      ticket.isArchived
        ? `<span class="ticket-status-icon ticket-status-icon-archived" title="Archived" aria-label="Archived">${icon("archive")}</span>`
        : "",
    ].join("");
  }

  elements.boardList.addEventListener("dragover", sidebarBoardsModule.handleBoardListDragOver);
  elements.listBoard.addEventListener("click", listModule.handleListBoardClick);
  elements.listBoard.addEventListener("change", listModule.handleListBoardChange);
  elements.listBoard.addEventListener("scroll", listModule.handleListBoardScroll, true);

  return {
    renderBoards: sidebarBoardsModule.renderBoards,
    renderBoardDetail,
    renderSidebarTags: sidebarTagsModule.renderSidebarTags,
    handleLaneDragOver: kanbanModule.handleLaneDragOver,
    createBoard: sidebarBoardsModule.createBoard,
    createLane: kanbanModule.createLane,
    renameBoard: boardSettingsModule.renameBoard,
    deleteBoard: boardSettingsModule.deleteBoard,
    createTag: sidebarTagsModule.createTag,
    renameLane: kanbanModule.renameLane,
    deleteLane: kanbanModule.deleteLane,
    exportBoard: boardSettingsModule.exportBoard,
    importBoard: boardSettingsModule.importBoard,
    toggleSidebar: boardSettingsModule.toggleSidebar,
    toggleBoardSettings: boardSettingsModule.toggleBoardSettings,
    syncSidebar: boardSettingsModule.syncSidebar,
  };
}
