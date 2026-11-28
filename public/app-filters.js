import { createBoardFilterPickers } from "./app-board-filter-pickers.js";
import { t as tr } from "./app-i18n.js";
import { normalizeStoredFilters } from "./app-preferences.js";
import { renderTag } from "./app-tags.js";
export function createFiltersModule(ctx, options) {
  const { state, elements } = ctx;
  const PRIORITY_LABELS = {
    low: tr("Low"),
    medium: tr("Medium"),
    high: tr("High"),
    urgent: tr("Urgent"),
  };

  let filterBoardId = null;
  let lanes = [];
  let tags = [];
  const { pickers: [lanePicker, tagPicker], close: closeBoardFilterPickers, position: positionFilterPicker } = createBoardFilterPickers([
    {
      root: elements.laneFilter,
      label: "Lane: {value}",
      emptyLabel: tr("No lanes"),
      onChange: (ids) => updateSelection("laneIds", ids),
    },
    {
      root: elements.tagFilter,
      label: "Tag: {value}",
      emptyLabel: tr("No tags yet."),
      renderName: (tag) => renderTag(tag, ctx.escapeHtml),
      onChange: (ids) => updateSelection("tagIds", ids),
    },
  ]);

  function updateSelection(key, ids) {
    state.filters[key] = ids.sort((left, right) => left - right);
    saveBoardFilters();
    syncActiveFilterStyles();
    options.refreshBoardDetail().catch(error => options.showToast(error.message, "error"));
  }

  function toggleTagFilter(tagId) {
    if (state.viewMode === "group") return;
    const selected = state.filters.tagIds;
    updateSelection("tagIds", selected.includes(tagId)
      ? selected.filter(id => id !== tagId)
      : [...selected, tagId]);
  }

  function clearBoardFilterChoices() {
    closeBoardFilterPickers();
    filterBoardId = null;
    lanes = [];
    tags = [];
  }

  const toolbar = elements.shell.querySelector(".toolbar");
  const main = elements.shell.querySelector(".main");
  let measuredMainWidth = -1;
  const toolbarResizeObserver = new ResizeObserver(() => {
    const width = main.getBoundingClientRect().width;
    if (width !== measuredMainWidth) {
      measuredMainWidth = width;
      syncSharedToolbarHeight();
    }
  });
  toolbarResizeObserver.observe(main);
  document.fonts.ready.then(syncSharedToolbarHeight);

  // Measure the existing controls in List mode, then restore them synchronously
  // before paint. All views share that footprint without moving their controls.
  function syncSharedToolbarHeight() {
    const viewClasses = ["view-kanban", "view-list", "view-group"];
    const savedClasses = viewClasses.filter((name) => elements.shell.classList.contains(name));
    const laneHidden = elements.laneFilter.hidden;
    const resetHidden = elements.resetFiltersButton.hidden;
    const minHeight = toolbar.style.minHeight;
    const filters = toolbar.querySelector(".toolbar-filters");
    const scrollLeft = filters.scrollLeft;
    let height;
    try {
      toolbar.style.minHeight = "0px";
      elements.shell.classList.remove(...viewClasses);
      elements.shell.classList.add("view-list");
      elements.laneFilter.hidden = false;
      // Reserving this existing action prevents the first active filter adding a row.
      elements.resetFiltersButton.hidden = false;
      height = toolbar.getBoundingClientRect().height;
    } finally {
      elements.shell.classList.remove(...viewClasses);
      elements.shell.classList.add(...savedClasses);
      elements.laneFilter.hidden = laneHidden;
      elements.resetFiltersButton.hidden = resetHidden;
      toolbar.style.minHeight = minHeight;
      filters.scrollLeft = scrollLeft;
    }
    toolbar.style.setProperty("--shared-toolbar-height", `${height}px`);
    positionFilterPicker();
  }

  function syncViewMode() {
    elements.viewModeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
    });
    elements.shell.classList.toggle("view-kanban", state.viewMode === "kanban");
    elements.shell.classList.toggle("view-list", state.viewMode === "list");
    elements.shell.classList.toggle("view-group", state.viewMode === "group");
    elements.groupBoard.hidden = state.viewMode !== "group";
    elements.laneBoard.hidden = state.viewMode !== "kanban";
    elements.listBoard.hidden = state.viewMode !== "list";
    elements.laneFilter.hidden = state.viewMode !== "list";
    syncSharedToolbarHeight();
  }

  function resetBoardFilters() {
    applyBoardFilters();
  }

  function saveBoardFilters(boardId = state.activeBoardId) {
    if (!boardId) {
      return;
    }
    state.filtersByBoardId[String(boardId)] = normalizeStoredFilters(state.filters);
    options.persistUiPreferences?.();
  }

  function restoreBoardFilters(boardId = state.activeBoardId) {
    closeBoardFilterPickers();
    if (boardId !== filterBoardId) clearBoardFilterChoices();
    const savedFilters = boardId ? state.filtersByBoardId[String(boardId)] : null;
    applyBoardFilters(savedFilters);
  }

  function saveBoardFilterExpansion(boardId = state.activeBoardId) {
    if (!boardId) {
      return;
    }
    state.filterExpansionByBoardId[String(boardId)] = {
      priority: isPriorityExpanded(),
    };
    options.persistUiPreferences?.();
  }

  function restoreBoardFilterExpansion(boardId = state.activeBoardId) {
    const expansion = boardId ? state.filterExpansionByBoardId[String(boardId)] : null;
    syncPriorityExpansion(expansion?.priority === true);
  }

  function normalizeBoardFiltersForDetail(detail) {
    filterBoardId = detail.board.id;
    lanes = detail.lanes;
    tags = detail.tags;
    const { laneIds, tagIds, legacyTagName } = state.filters;
    const laneChoices = new Set(lanes.map(lane => lane.id));
    const tagChoices = new Set(tags.map(tag => tag.id));
    const migratedTag = legacyTagName && tags.find(tag => tag.name === legacyTagName);
    const nextLanes = laneIds.filter(id => laneChoices.has(id));
    const nextTags = tagIds.filter(id => tagChoices.has(id));
    if (migratedTag && !nextTags.includes(migratedTag.id)) nextTags.push(migratedTag.id);
    if (legacyTagName || nextLanes.length !== laneIds.length || nextTags.length !== tagIds.length) {
      const nextFilters = { ...state.filters, laneIds: nextLanes, tagIds: nextTags };
      delete nextFilters.legacyTagName;
      state.filters = normalizeStoredFilters(nextFilters);
      saveBoardFilters();
    }
    syncActiveFilterStyles();
  }

  function applyBoardFilters(filters) {
    state.filters = normalizeStoredFilters(filters);
    syncFilterControls();
  }

  function syncFilterControls() {
    elements.searchInput.value = state.filters.q;
    syncSearchClearButton();
    syncPriorityFilter();
    syncActiveFilterStyles();
  }

  function buildTicketListUrl() {
    const { includeArchived, laneIds, tagIds, q, priority } = state.filters;
    const params = new URLSearchParams();
    if (includeArchived) {
      params.set("archived", "all");
    }
    if (state.viewMode === "list" && laneIds.length) {
      params.set("lane_ids", laneIds.join(","));
    }
    if (tagIds.length) {
      params.set("tag_ids", tagIds.join(","));
    }
    if (q) {
      params.set("q", q);
    }
    if (priority.length) {
      const values = { low: 1, medium: 2, high: 3, urgent: 4 };
      params.set("priority", priority.map((value) => values[value]).sort().join(","));
    }
    const query = params.toString();
    return `/api/boards/${state.activeBoardId}/tickets${query ? `?${query}` : ""}`;
  }

  function hasActiveTicketFilters() {
    return state.filters.q !== ""
      || (state.viewMode === "list" && state.filters.laneIds.length > 0)
      || state.filters.includeArchived
      || state.filters.priority.length > 0
      || state.filters.tagIds.length > 0;
  }

  function filterTicketsForDisplay(tickets) {
    return tickets
      .filter((ticket) => (state.filters.includeArchived || !ticket.isArchived) && matchesPriorityFilter(ticket));
  }

  function bindFilterEvents() {
    elements.viewModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        closeBoardFilterPickers();
        state.viewMode = button.dataset.viewMode || "kanban";
        syncViewMode();
        syncActiveFilterStyles();
        options.refreshBoardDetail().catch((error) => {
          console.error(error);
          options.showToast(error.message, "error");
        });
        options.syncBoardUrl();
      });
    });
    elements.searchInput.addEventListener("input", async (event) => {
      state.filters.q = event.target.value.trim();
      saveBoardFilters();
      syncSearchClearButton();
      syncActiveFilterStyles();
      try { await options.refreshBoardDetail(); }
      catch (error) { options.showToast(error.message, "error"); }
    });
    elements.searchClearButton.addEventListener("click", async () => {
      state.filters.q = "";
      elements.searchInput.value = "";
      saveBoardFilters();
      syncSearchClearButton();
      syncActiveFilterStyles();
      elements.searchInput.focus();
      try { await options.refreshBoardDetail(); }
      catch (error) { options.showToast(error.message, "error"); }
    });
    elements.includeArchivedButton.addEventListener("click", async () => {
      state.filters.includeArchived = !state.filters.includeArchived;
      saveBoardFilters();
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.priorityFilterToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        syncPriorityExpansion(!isPriorityExpanded());
        saveBoardFilterExpansion();
      });
    });
    elements.priorityFilterButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.dataset.priorityFilter;
        if (!value) {
          return;
        }
        state.filters.priority = state.filters.priority.includes(value)
          ? state.filters.priority.filter((item) => item !== value)
          : [...state.filters.priority, value];
        saveBoardFilters();
        syncPriorityFilter();
        syncActiveFilterStyles();
        collapsePriorityWhenToolbarIsTight();
        await options.refreshBoardDetail();
      });
    });
    elements.priorityFilterClearButton.addEventListener("click", async () => {
      state.filters.priority = [];
      saveBoardFilters();
      syncPriorityFilter();
      syncActiveFilterStyles();
      syncPriorityExpansion(false);
      saveBoardFilterExpansion();
      await options.refreshBoardDetail();
    });
    elements.resetFiltersButton.addEventListener("click", async () => {
      closeBoardFilterPickers();
      resetBoardFilters();
      saveBoardFilters();
      syncPriorityExpansion(false);
      saveBoardFilterExpansion();
      await options.refreshBoardDetail();
    });
  }

  function syncPriorityFilter() {
    elements.priorityFilterButtons.forEach((button) => {
      button.classList.toggle("active", state.filters.priority.includes(button.dataset.priorityFilter ?? ""));
    });
    elements.priorityFilterSummary.textContent = summarizeFilter(state.filters.priority, PRIORITY_LABELS, tr("Any"));
    elements.priorityFilterClearButton.hidden = state.filters.priority.length === 0;
  }

  function collapsePriorityWhenToolbarIsTight() {
    const toolbarFilters = elements.priorityFilter.closest(".toolbar-filters");
    if (!toolbarFilters || toolbarFilters.getBoundingClientRect().width > 620) {
      return;
    }
    syncPriorityExpansion(false);
    saveBoardFilterExpansion();
  }

  function isPriorityExpanded() {
    return elements.priorityFilterToggles[0]?.getAttribute("aria-expanded") === "true";
  }

  function syncPriorityExpansion(expanded) {
    const { priorityFilter, priorityFilterToggles, priorityFilterOptions } = elements;
    priorityFilterToggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    priorityFilter.classList.toggle("is-expanded", expanded);
    priorityFilterOptions.hidden = !expanded;
    priorityFilter.querySelector(".filter-menu-edge-toggle use")?.setAttribute("href", expanded ? "/icons.svg#chevron-left" : "/icons.svg#chevron-right");
    syncSharedToolbarHeight();
  }

  function syncSearchClearButton() {
    elements.searchClearButton.hidden = state.filters.q === "";
  }

  function syncActiveFilterStyles() {
    elements.searchInput.closest(".toolbar-search")?.classList.toggle("is-filter-active", state.filters.q !== "");
    lanePicker.update(lanes, state.filters.laneIds);
    elements.includeArchivedButton.classList.toggle("active", state.filters.includeArchived);
    elements.includeArchivedButton.setAttribute("aria-pressed", String(state.filters.includeArchived));
    elements.priorityFilter.classList.toggle("is-filter-active", state.filters.priority.length > 0);
    tagPicker.update(tags, state.filters.tagIds);
    options.syncSidebarTagControls();
    elements.resetFiltersButton.hidden = !hasActiveTicketFilters();
    syncSharedToolbarHeight();
  }

  function summarizeFilter(values, labels, fallback) {
    if (!values.length) {
      return fallback;
    }
    if (values.length === 1) {
      return labels[values[0]] ?? values[0];
    }
    return tr("{count} selected", { count: values.length });
  }

  function matchesPriorityFilter(ticket) {
    if (state.filters.priority.length === 0) {
      return true;
    }
    return state.filters.priority.some((item) => {
      if (item === "urgent") {
        return ticket.priority === 4;
      }
      if (item === "high") {
        return ticket.priority === 3;
      }
      if (item === "medium") {
        return ticket.priority === 2;
      }
      return ticket.priority === 1;
    });
  }

  return {
    bindFilterEvents,
    buildTicketListUrl,
    clearBoardFilterChoices,
    closeBoardFilterPickers,
    filterTicketsForDisplay,
    hasActiveTicketFilters,
    normalizeBoardFiltersForDetail,
    resetBoardFilters,
    restoreBoardFilterExpansion,
    restoreBoardFilters,
    saveBoardFilterExpansion,
    saveBoardFilters,
    syncActiveFilterStyles,
    syncViewMode,
    toggleTagFilter,
  };
}
