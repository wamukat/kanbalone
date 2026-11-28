import { t as tr } from "./app-i18n.js";
import { describeTicketFilters } from "./app-filter-summary.js";
import { getListTicketComparator, LIST_SORT_KEYS } from "./app-ticket-sort.js";
export { getListTicketComparator, LIST_SORT_KEYS } from "./app-ticket-sort.js";
import { renderListActions } from "./app-board-list-actions.js";
import { renderListRow } from "./app-board-list-row.js";
import { createListRowWindow } from "./app-board-list-window.js";
import { createListSelectionModule } from "./app-board-list-selection.js";
import { indexTicketHierarchy } from "./app-ticket-hierarchy.js";
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
  const { byId, childrenByParent } = indexTicketHierarchy(tickets);
  const roots = tickets
    .filter((ticket) => ticket.parentTicketId == null || !byId.has(ticket.parentTicketId))
    .sort(compareTickets);
  const ordered = [];
  const seen = new Set();
  for (const root of roots) {
    ordered.push({ ticket: root, indent: 0 });
    seen.add(root.id);
    const children = (childrenByParent.get(root.id) ?? []).sort(compareTickets);
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
  const { hasActiveTicketFilters, renderEmptyState, renderTicketStatusIcons } = options;
  const listSelection = createListSelectionModule(ctx);
  let listModel = null;
  let listSort = null;
  let listWindow = null;
  let boardId = null;
  const measurements = new Map();

  function reset() {
    listWindow?.dispose();
    listWindow = null;
    listModel = null;
    measurements.clear();
    boardId = null;
  }

  function renderListBoard(detail) {
    const sameBoard = boardId === state.activeBoardId;
    const anchor = sameBoard ? listWindow?.capture() : null;
    if (!sameBoard) measurements.clear();
    boardId = state.activeBoardId;
    listWindow?.dispose();
    listWindow = null;
    const availableTicketIds = new Set(detail.tickets.map((ticket) => ticket.id));
    state.selectedListTicketIds = state.selectedListTicketIds.filter((ticketId) => availableTicketIds.has(ticketId));
    const selectedTicketIds = new Set(state.selectedListTicketIds);
    if (detail.tickets.length === 0) {
      elements.listBoard.className = "list-board empty";
      const firstLaneId = state.boardDetail?.lanes?.[0]?.id;
      elements.listBoard.innerHTML = hasActiveTicketFilters()
        ? renderEmptyState({
          iconName: "search",
          title: tr("No matching tickets"),
          body: describeTicketFilters(state.filters, detail.lanes, detail.tags),
          actionLabel: tr("Reset filters"),
          actionAttr: "data-empty-reset-filters",
          actionIcon: "rotate-ccw",
        })
        : renderEmptyState({
          iconName: "list",
          title: tr("No tickets yet"),
          body: tr("Create the first ticket, then switch between Kanban and List as it grows."),
          actionLabel: firstLaneId ? tr("Create ticket") : "",
          actionAttr: firstLaneId ? `data-empty-create-ticket="${firstLaneId}"` : "",
        });
      listModel = null;
      return;
    }
    elements.listBoard.className = "list-board";
    const orderedTickets = getListTickets(detail.tickets, listSort);
    const visibleTicketIds = orderedTickets.map(({ ticket }) => ticket.id);
    const allSelected = visibleTicketIds.length > 0 && visibleTicketIds.every((ticketId) => selectedTicketIds.has(ticketId));
    const escape = ctx.escapeHtml;
    const move = state.boards.length > 1 || detail.lanes.length > 1;
    const actions = renderListActions(
      detail.tickets,
      state.selectedListTicketIds,
      move,
    );
    elements.listBoard.innerHTML = `
      ${renderListActions(detail.tickets, state.selectedListTicketIds, move, true)}
      <div class="list-grid" role="table" aria-label="${escape(tr("Ticket list"))}" aria-rowcount="${visibleTicketIds.length + 1}">
        <div class="list-header" role="row" aria-rowindex="1">
          <div role="columnheader"><input type="checkbox" id="list-select-all" aria-label="${escape(tr("Select all matching tickets"))}" ${allSelected ? "checked" : ""} /></div>
          ${renderSortableListHeader("id", tr("ID / Title"))}
          <div role="columnheader">${tr("Blockers")}</div>
          ${renderSortableListHeader("tags", tr("Tags"))}
          ${renderSortableListHeader("priority", tr("Priority"))}
          <div role="columnheader">${tr("Lane")}</div>
          <div role="columnheader">${tr("Status")}</div>
        </div>
        <div class="list-viewport" role="presentation">
          <div class="list-spacer" role="presentation">
            <div class="list-window" role="rowgroup"></div>
          </div>
        </div>
      </div>
      ${actions}
    `;
    listModel = { visibleTicketIds };
    const viewport = elements.listBoard.querySelector(".list-viewport");
    const selectAll = elements.listBoard.querySelector("#list-select-all");
    if (selectAll) {
      const selectedCount = visibleTicketIds.filter((ticketId) => selectedTicketIds.has(ticketId)).length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleTicketIds.length;
    }
    const laneNames = new Map(detail.lanes.map(lane => [lane.id, lane.name]));
    const rowOptions = {
      boardTickets: state.boardTickets,
      escapeHtml: escape,
      lanes: detail.lanes,
      renderTicketStatusIcons,
      showHierarchy: !listSort,
      selectedTicketIds,
    };
    const template = document.createElement("template");
    listWindow = createListRowWindow({
      viewport,
      canvas: viewport.querySelector(".list-window"),
      spacer: viewport.querySelector(".list-spacer"),
      entries: orderedTickets,
      estimate: LIST_ROW_HEIGHT,
      overscan: LIST_OVERSCAN,
      measurements,
      layoutKey: ({ ticket, indent }) => JSON.stringify([
        rowOptions.showHierarchy, indent, ticket.parentTicketId, ticket.hasChildren, ticket.title,
        ticket.tags.map(tag => tag.name), ticket.taskCount, ticket.doneTaskCount, laneNames.get(ticket.laneId),
        ticket.priority, ticket.isResolved, ticket.isArchived, ticket.blockerIds, ticket.blockerReferences?.map(ref => ref.id),
        ticket.remote?.displayRef, ticket.externalReferences?.map(ref => ref.displayRef),
      ]),
      createRow(entry) {
        template.innerHTML = renderListRow(entry, rowOptions);
        return template.content.firstElementChild;
      },
      initialAnchor: anchor,
    });
  }

  function renderSortableListHeader(key, label) {
    const isActive = listSort?.key === key;
    const nextDirection = !isActive ? "asc" : listSort.direction === "asc" ? "desc" : "none";
    const iconName = !isActive ? "arrow-up-down" : listSort.direction === "asc" ? "arrow-up" : "arrow-down";
    const sortLabel = isActive
      ? tr("{label}, sorted {direction}", { label, direction: listSort.direction === "asc" ? tr("ascending") : tr("descending") })
      : tr("{label}, not sorted", { label });
    const ariaSort = isActive ? ` aria-sort="${listSort.direction === "asc" ? "ascending" : "descending"}"` : "";
    return `<div role="columnheader"${ariaSort}>
      <button
        type="button"
        class="list-sort-button ${isActive ? "active" : ""}"
        data-list-sort-key="${key}"
        data-list-sort-direction="${nextDirection}"
        aria-label="${sortLabel}"
      >
        <span>${label}</span>
        <span class="list-sort-indicator" aria-hidden="true">${icon(iconName)}</span>
      </button></div>
    `;
  }

  function paintVisibleListRows() {
    listWindow?.paint();
  }

  function getOrderedTicketIds() {
    return listModel?.visibleTicketIds ?? [];
  }

  function focusTicket(ticketId, { scroll = true } = {}) {
    const button = revealTicket(ticketId, scroll)?.querySelector(".list-ticket-link");
    button?.focus({ preventScroll: true });
    return Boolean(button);
  }

  function revealTicket(ticketId, scroll = false) {
    return listWindow?.reveal(ticketId, scroll) ?? null;
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
      listWindow?.schedule();
    }
  }

  return {
    getOrderedTicketIds,
    focusTicket,
    revealTicket,
    captureAnchor: () => listWindow?.capture() ?? null,
    restoreAnchor: (anchor) => listWindow?.restore(anchor),
    handleListBoardChange,
    handleListBoardClick,
    handleListBoardScroll,
    paintVisibleListRows,
    renderListBoard,
    reset,
  };
}
