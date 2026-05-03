import { calculateVisibleWindow } from "./app-board-utils.js";
import { renderListActions } from "./app-board-list-actions.js";
import { renderListRow } from "./app-board-list-row.js";
import { createListSelectionModule } from "./app-board-list-selection.js";

export { renderListActions } from "./app-board-list-actions.js";

export const LIST_ROW_HEIGHT = 64;
export const LIST_OVERSCAN = 12;

function comparePriorityDescending(a, b) {
  return b.priority - a.priority || a.id - b.id;
}

export function getListTickets(tickets) {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const roots = tickets
    .filter((ticket) => ticket.parentTicketId == null || !byId.has(ticket.parentTicketId))
    .sort(comparePriorityDescending);
  const ordered = [];
  const seen = new Set();
  for (const root of roots) {
    ordered.push({ ticket: root, indent: 0 });
    seen.add(root.id);
    const children = tickets
      .filter((candidate) => candidate.parentTicketId === root.id)
      .sort(comparePriorityDescending);
    for (const child of children) {
      ordered.push({ ticket: child, indent: 1 });
      seen.add(child.id);
    }
  }
  for (const ticket of tickets.sort(comparePriorityDescending)) {
    if (!seen.has(ticket.id)) {
      ordered.push({ ticket, indent: ticket.parentTicketId == null ? 0 : 1 });
    }
  }
  return ordered;
}

export function createListBoardModule(ctx, options) {
  const { state, elements } = ctx;
  const { hasUserTicketFilters, renderEmptyState, renderTicketStatusIcons } = options;
  const listSelection = createListSelectionModule(ctx);
  let listModel = null;

  function reset() {
    listModel = null;
  }

  function renderListBoard(detail) {
    state.selectedListTicketIds = state.selectedListTicketIds.filter((ticketId) => detail.tickets.some((ticket) => ticket.id === ticketId));
    if (detail.tickets.length === 0) {
      elements.listBoard.className = "list-board empty";
      const firstLaneId = state.boardDetail?.lanes?.[0]?.id;
      elements.listBoard.innerHTML = hasUserTicketFilters()
        ? renderEmptyState({
          iconName: "search",
          title: "No matching tickets",
          body: "Try a different search, tag, lane, or resolved filter.",
        })
        : renderEmptyState({
          iconName: "list",
          title: state.filters.status.length === 1 && state.filters.status[0] === "open" ? "No open tickets" : "No tickets yet",
          body: state.filters.status.length === 1 && state.filters.status[0] === "open"
            ? "Create a ticket or switch the status filter."
            : "Create the first ticket, then switch between Kanban and List as it grows.",
          actionLabel: firstLaneId ? "Create ticket" : "",
          actionAttr: firstLaneId ? `data-empty-create-ticket="${firstLaneId}"` : "",
        });
      listModel = null;
      return;
    }
    elements.listBoard.className = "list-board";
    const orderedTickets = getListTickets(detail.tickets);
    const visibleTicketIds = orderedTickets.map(({ ticket }) => ticket.id);
    const allSelected = visibleTicketIds.length > 0 && visibleTicketIds.every((ticketId) => state.selectedListTicketIds.includes(ticketId));
    const previousScrollTop = elements.listBoard.querySelector(".list-viewport")?.scrollTop ?? 0;
    const actions = renderListActions(
      detail.tickets,
      state.selectedListTicketIds,
      state.boards.length > 1 || detail.lanes.length > 1,
    );
    elements.listBoard.innerHTML = `
      ${actions}
      <div class="list-header">
        <div><input type="checkbox" id="list-select-all" ${allSelected ? "checked" : ""} /></div>
        <div>ID / Title</div>
        <div>Blockers</div>
        <div>Tags</div>
        <div>Priority</div>
        <div>Lane</div>
        <div>Status</div>
      </div>
      <div class="list-viewport">
        <div class="list-spacer" style="height:${orderedTickets.length * LIST_ROW_HEIGHT}px">
          <div class="list-window"></div>
        </div>
      </div>
      ${actions}
    `;
    listModel = { orderedTickets, visibleTicketIds, rowHeight: LIST_ROW_HEIGHT, overscan: LIST_OVERSCAN };
    const viewport = elements.listBoard.querySelector(".list-viewport");
    if (viewport) {
      viewport.scrollTop = previousScrollTop;
    }
    const selectAll = elements.listBoard.querySelector("#list-select-all");
    if (selectAll) {
      const selectedCount = visibleTicketIds.filter((ticketId) => state.selectedListTicketIds.includes(ticketId)).length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleTicketIds.length;
    }
    paintVisibleListRows();
  }

  function paintVisibleListRows() {
    if (!listModel) {
      return;
    }
    const viewport = elements.listBoard.querySelector(".list-viewport");
    const windowEl = elements.listBoard.querySelector(".list-window");
    if (!viewport || !windowEl) {
      return;
    }
    const { startIndex, endIndex } = calculateVisibleWindow(
      listModel.orderedTickets.length,
      listModel.rowHeight,
      listModel.overscan,
      viewport.scrollTop,
      viewport.clientHeight,
    );
    const visibleEntries = listModel.orderedTickets.slice(startIndex, endIndex);
    windowEl.style.transform = `translateY(${startIndex * listModel.rowHeight}px)`;
    windowEl.innerHTML = visibleEntries.map((entry) => renderListRow(entry, {
      boardTickets: state.boardTickets,
      escapeHtml: ctx.escapeHtml,
      lanes: state.boardDetail.lanes,
      renderTicketStatusIcons,
      rowHeight: LIST_ROW_HEIGHT,
      selectedTicketIds: state.selectedListTicketIds,
    })).join("");
  }

  function handleListBoardClick(event) {
    const familySelectButton = event.target.closest("[data-select-family-ticket-id]");
    if (familySelectButton && elements.listBoard.contains(familySelectButton)) {
      listSelection.handleListFamilySelection(Number(familySelectButton.dataset.selectFamilyTicketId));
      return;
    }
    const createTicketButton = event.target.closest("[data-empty-create-ticket]");
    if (createTicketButton && elements.listBoard.contains(createTicketButton)) {
      ctx.openEditor(null, "edit", Number(createTicketButton.dataset.emptyCreateTicket));
      return;
    }
    const openButton = event.target.closest("[data-open-ticket-id]");
    if (openButton && elements.listBoard.contains(openButton)) {
      ctx.openEditor(Number(openButton.dataset.openTicketId), "view");
      return;
    }
    const bulkButton = event.target.closest(".list-action-button");
    if (bulkButton && elements.listBoard.contains(bulkButton) && !bulkButton.disabled) {
      if (bulkButton.dataset.bulkDelete) {
        listSelection.deleteSelectedListTickets();
        return;
      }
      if (bulkButton.dataset.bulkMoveBoard) {
        listSelection.moveSelectedListTickets();
        return;
      }
      if (bulkButton.dataset.bulkArchive) {
        listSelection.updateSelectedListArchive(bulkButton.dataset.bulkArchive === "true");
        return;
      }
      listSelection.updateSelectedListTickets(bulkButton.dataset.bulkResolve === "true");
    }
  }

  function handleListBoardChange(event) {
    const ticketCheckbox = event.target.closest("[data-list-ticket-id]");
    if (ticketCheckbox && elements.listBoard.contains(ticketCheckbox)) {
      listSelection.handleListTicketSelection(ticketCheckbox);
      return;
    }
    const selectAll = event.target.closest("#list-select-all");
    if (selectAll && listModel) {
      listSelection.handleListSelectAll(selectAll, listModel.visibleTicketIds);
    }
  }

  function handleListBoardScroll(event) {
    if (event.target?.classList?.contains("list-viewport")) {
      paintVisibleListRows();
    }
  }

  return {
    handleListBoardChange,
    handleListBoardClick,
    handleListBoardScroll,
    paintVisibleListRows,
    renderListBoard,
    reset,
  };
}
