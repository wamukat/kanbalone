import { t as tr } from "./app-i18n.js";
import { normalizeStoredFilters } from "./app-preferences.js";
export function createFiltersModule(ctx, options) {
  const { state, elements } = ctx;
  const PRIORITY_LABELS = {
    low: tr("Low"),
    medium: tr("Medium"),
    high: tr("High"),
    urgent: tr("Urgent"),
  };

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
    let nextFilters = state.filters;
    if (state.filters.lane && !detail.lanes.some((lane) => String(lane.id) === String(state.filters.lane))) {
      nextFilters = { ...nextFilters, lane: "" };
    }
    if (state.filters.tag && !detail.tags.some((tag) => tag.name === state.filters.tag)) {
      nextFilters = { ...nextFilters, tag: "" };
    }
    if (nextFilters !== state.filters) {
      applyBoardFilters(nextFilters);
      saveBoardFilters();
    }
  }

  function applyBoardFilters(filters) {
    state.filters = normalizeStoredFilters(filters);
    syncFilterControls();
  }

  function syncFilterControls() {
    elements.searchInput.value = state.filters.q;
    syncSearchClearButton();
    elements.laneFilter.value = state.filters.lane;
    syncPriorityFilter();
    elements.tagFilter.value = state.filters.tag;
    syncActiveFilterStyles();
  }

  function buildTicketListUrl() {
    const { includeArchived, lane, tag, q, priority } = state.filters;
    const params = new URLSearchParams();
    if (includeArchived) {
      params.set("archived", "all");
    }
    if (state.viewMode === "list" && lane) {
      params.set("lane_id", lane);
    }
    if (tag) {
      params.set("tag", tag);
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
      || (state.viewMode === "list" && state.filters.lane !== "")
      || state.filters.includeArchived
      || state.filters.priority.length > 0
      || state.filters.tag !== "";
  }

  function filterTicketsForDisplay(tickets) {
    return tickets
      .filter((ticket) => (state.filters.includeArchived || !ticket.isArchived) && matchesPriorityFilter(ticket));
  }

  function bindFilterEvents() {
    elements.viewModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
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
    elements.laneFilter.addEventListener("change", async (event) => {
      state.filters.lane = event.target.value;
      saveBoardFilters();
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
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
    elements.tagFilter.addEventListener("change", async (event) => {
      state.filters.tag = event.target.value;
      saveBoardFilters();
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.resetFiltersButton.addEventListener("click", async () => {
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
    elements.laneFilter.classList.toggle("is-filter-active", state.viewMode === "list" && state.filters.lane !== "");
    elements.includeArchivedButton.classList.toggle("active", state.filters.includeArchived);
    elements.includeArchivedButton.setAttribute("aria-pressed", String(state.filters.includeArchived));
    elements.priorityFilter.classList.toggle("is-filter-active", state.filters.priority.length > 0);
    elements.tagFilter.classList.toggle("is-filter-active", state.filters.tag !== "");
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
  };
}
