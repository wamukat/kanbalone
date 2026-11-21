import { t as tr } from "./app-i18n.js";
import { describeTicketFilters } from "./app-filter-summary.js";
import { getListTicketComparator, LIST_SORT_KEYS } from "./app-ticket-sort.js";
export { getListTicketComparator, LIST_SORT_KEYS } from "./app-ticket-sort.js";
import { calculateVisibleWindow } from "./app-board-utils.js";
import { renderListActions } from "./app-board-list-actions.js";
import { renderListRow } from "./app-board-list-row.js";
import { createListSelectionModule } from "./app-board-list-selection.js";
import { icon } from "./icons.js";

export { renderListActions } from "./app-board-list-actions.js";

export const LIST_ROW_HEIGHT = 64;
export const LIST_OVERSCAN = 12;
export function getListTickets(tickets, sort = null) {
  const compareTickets = getListTicketComparator(sort);
  if (sort && LIST_SORT_KEYS.has(sort.key)) {
    return [...tickets]
      .sort(compareTickets)
      .map((ticket) => ({ ticket, indent: 0 }));
  }
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const roots = tickets
    .filter((ticket) => ticket.parentTicketId == null || !byId.has(ticket.parentTicketId))
    .sort(compareTickets);
  const ordered = [];
  const seen = new Set();
  for (const root of roots) {
    ordered.push({ ticket: root, indent: 0 });
    seen.add(root.id);
    const children = tickets
      .filter((candidate) => candidate.parentTicketId === root.id)
      .sort(compareTickets);
    for (const child of children) {
      ordered.push({ ticket: child, indent: 1 });
      seen.add(child.id);
    }
  }
  for (const ticket of [...tickets].sort(compareTickets)) {
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
  let listSort = null;

  function reset() {
    listModel = null;
  }

  function renderListBoard(detail) {
    state.selectedListTicketIds = state.selectedListTicketIds.filter((ticketId) => detail.tickets.some((ticket) => ticket.id === ticketId));
    if (detail.tickets.length === 0) {
      elements.listBoard.className = "list-board empty";
      const firstLaneId = state.boardDetail?.lanes?.[0]?.id;
      const selectedLane = detail.lanes.find((lane) => String(lane.id) === String(state.filters.lane));
      const excludedStatus = selectedLane?.isCompletionLane ? "resolved" : "open";
      if (selectedLane && !state.filters.status.includes(excludedStatus)) {
        elements.listBoard.innerHTML = renderEmptyState({
          iconName: "search",
          title: tr("No matching tickets"),
          body: tr(selectedLane.isCompletionLane
            ? "{lane} is a completion lane, so it has no open tickets."
            : "{lane} is not a completion lane, so it has no resolved tickets.", { lane: selectedLane.name }),
          actionLabel: tr(selectedLane.isCompletionLane ? "Include resolved tickets" : "Include open tickets"),
          actionAttr: `data-empty-include-status="${excludedStatus}"`,
          actionIcon: selectedLane.isCompletionLane ? "check" : "circle",
          secondaryActionLabel: tr("Clear lane filter"),
          secondaryActionAttr: "data-empty-clear-lane",
        });
        listModel = null;
        return;
      }
      elements.listBoard.innerHTML = hasUserTicketFilters()
        ? renderEmptyState({
          iconName: "search",
          title: tr("No matching tickets"),
          body: describeTicketFilters(state.filters, detail.lanes),
          actionLabel: tr("Reset filters"),
          actionAttr: "data-empty-reset-filters",
          actionIcon: "rotate-ccw",
        })
        : renderEmptyState({
          iconName: "list",
          title: state.filters.status.length === 1 && state.filters.status[0] === "open" ? tr("No open tickets") : tr("No tickets yet"),
          body: state.filters.status.length === 1 && state.filters.status[0] === "open"
            ? tr("Create a ticket or switch the status filter.")
            : tr("Create the first ticket, then switch between Kanban and List as it grows."),
          actionLabel: firstLaneId ? tr("Create ticket") : "",
          actionAttr: firstLaneId ? `data-empty-create-ticket="${firstLaneId}"` : "",
        });
      listModel = null;
      return;
    }
    elements.listBoard.className = "list-board";
    const orderedTickets = getListTickets(detail.tickets, listSort);
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
        ${renderSortableListHeader("id", tr("ID / Title"))}
        <div>${tr("Blockers")}</div>
        ${renderSortableListHeader("tags", tr("Tags"))}
        ${renderSortableListHeader("priority", tr("Priority"))}
        <div>${tr("Lane")}</div>
        <div>${tr("Status")}</div>
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

  function renderSortableListHeader(key, label) {
    const isActive = listSort?.key === key;
    const nextDirection = !isActive ? "asc" : listSort.direction === "asc" ? "desc" : "none";
    const iconName = !isActive ? "arrow-up-down" : listSort.direction === "asc" ? "arrow-up" : "arrow-down";
    const sortLabel = isActive
      ? tr("{label}, sorted {direction}", { label, direction: listSort.direction === "asc" ? tr("ascending") : tr("descending") })
      : tr("{label}, not sorted", { label });
    return `
      <button
        type="button"
        class="list-sort-button ${isActive ? "active" : ""}"
        data-list-sort-key="${key}"
        data-list-sort-direction="${nextDirection}"
        aria-label="${sortLabel}"
      >
        <span>${label}</span>
        <span class="list-sort-indicator" aria-hidden="true">${icon(iconName)}</span>
      </button>
    `;
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
      showHierarchy: !listSort,
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
    if (event.target.closest("[data-empty-reset-filters]")) {
      document.querySelector("#reset-filters-button")?.click();
      return;
    }
    const includeStatusButton = event.target.closest("[data-empty-include-status]");
    if (includeStatusButton && elements.listBoard.contains(includeStatusButton)) {
      const status = includeStatusButton.dataset.emptyIncludeStatus;
      elements.statusFilterButtons.find((button) => button.dataset.statusFilter === status)?.click();
      return;
    }
    if (event.target.closest("[data-empty-clear-lane]")) {
      elements.laneFilter.value = "";
      elements.laneFilter.dispatchEvent(new Event("change", { bubbles: true }));
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
    const sortButton = event.target.closest("[data-list-sort-key]");
    if (sortButton && elements.listBoard.contains(sortButton)) {
      updateListSort(sortButton.dataset.listSortKey, sortButton.dataset.listSortDirection);
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

    }
  }

  function updateListSort(key, direction) {
    if (!LIST_SORT_KEYS.has(key)) {
      return;
    }
    if (direction === "none") {
      listSort = null;
      ctx.renderBoardDetail();
      return;
    }
    listSort = { key, direction: direction === "desc" ? "desc" : "asc" };
    ctx.renderBoardDetail();
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
