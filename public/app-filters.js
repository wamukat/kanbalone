import { t as tr } from "./app-i18n.js";
export function createFiltersModule(ctx, options) {
  const { state, elements } = ctx;
  const DEFAULT_BOARD_FILTERS = { q: "", lane: "", status: ["open", "resolved"], priority: [], tag: "" };
  const STATUS_LABELS = {
    open: tr("Open"),
    resolved: tr("Resolved"),
    archived: tr("Archived"),
  };
  const PRIORITY_LABELS = {
    low: tr("Low"),
    medium: tr("Medium"),
    high: tr("High"),
    urgent: tr("Urgent"),
  };

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
  }

  function resetBoardFilters() {
    applyBoardFilters(DEFAULT_BOARD_FILTERS);
  }

  function saveBoardFilters(boardId = state.activeBoardId) {
    if (!boardId) {
      return;
    }
    state.filtersByBoardId[String(boardId)] = cloneFilters(state.filters);
    options.persistUiPreferences?.();
  }

  function restoreBoardFilters(boardId = state.activeBoardId) {
    const savedFilters = boardId ? state.filtersByBoardId[String(boardId)] : null;
    applyBoardFilters(savedFilters ?? DEFAULT_BOARD_FILTERS);
  }

  function saveBoardFilterExpansion(boardId = state.activeBoardId) {
    if (!boardId) {
      return;
    }
    state.filterExpansionByBoardId[String(boardId)] = {
      status: isFilterExpanded(elements.statusFilterToggles),
      priority: isFilterExpanded(elements.priorityFilterToggles),
    };
    options.persistUiPreferences?.();
  }

  function restoreBoardFilterExpansion(boardId = state.activeBoardId) {
    const expansion = boardId ? state.filterExpansionByBoardId[String(boardId)] : null;
    syncFilterExpansion(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions, expansion?.status === true);
    syncFilterExpansion(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions, expansion?.priority === true);
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
    state.filters = cloneFilters(filters);
    syncFilterControls();
  }

  function syncFilterControls() {
    elements.searchInput.value = state.filters.q;
    syncSearchClearButton();
    elements.laneFilter.value = state.filters.lane;
    syncStatusFilter();
    syncPriorityFilter();
    elements.tagFilter.value = state.filters.tag;
    syncActiveFilterStyles();
  }

  function cloneFilters(filters) {
    return {
      q: filters?.q ?? "",
      lane: filters?.lane ?? "",
      status: Array.isArray(filters?.status) && filters.status.length ? [...filters.status] : [...DEFAULT_BOARD_FILTERS.status],
      priority: Array.isArray(filters?.priority) ? [...filters.priority] : [],
      tag: filters?.tag ?? "",
    };
  }

  function buildTicketListUrl(filters = {}) {
    const params = new URLSearchParams();
    const status = filters.status ?? state.filters.status;
    if (status.includes("archived")) {
      params.set("archived", "all");
    }
    if (status.length === 1 && status[0] === "open") {
      params.set("resolved", "false");
    } else if (status.length === 1 && status[0] === "resolved") {
      params.set("resolved", "true");
    }
    const lane = filters.lane ?? (state.viewMode === "list" ? state.filters.lane : "");
    if (lane) {
      params.set("lane_id", String(lane));
    }
    if (filters.tag ?? state.filters.tag) {
      params.set("tag", String(filters.tag ?? state.filters.tag));
    }
    if (filters.q ?? state.filters.q) {
      params.set("q", String(filters.q ?? state.filters.q));
    }
    const query = params.toString();
    return `/api/boards/${state.activeBoardId}/tickets${query ? `?${query}` : ""}`;
  }

  function hasActiveTicketFilters() {
    return state.filters.q !== ""
      || (state.viewMode === "list" && state.filters.lane !== "")
      || !isDefaultStatusFilter()
      || state.filters.priority.length > 0
      || state.filters.tag !== "";
  }

  function filterTicketsForDisplay(tickets) {
    return tickets
      .filter((ticket) => matchesStatusFilter(ticket))
      .filter((ticket) => matchesPriorityFilter(ticket));
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
      await options.refreshBoardDetail();
    });
    elements.searchClearButton.addEventListener("click", async () => {
      state.filters.q = "";
      elements.searchInput.value = "";
      saveBoardFilters();
      syncSearchClearButton();
      syncActiveFilterStyles();
      elements.searchInput.focus();
      await options.refreshBoardDetail();
    });
    elements.laneFilter.addEventListener("change", async (event) => {
      state.filters.lane = event.target.value;
      saveBoardFilters();
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.statusFilterToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        toggleFilterExpansion(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions);
        saveBoardFilterExpansion();
      });
    });
    elements.priorityFilterToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        toggleFilterExpansion(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions);
        saveBoardFilterExpansion();
      });
    });
    elements.statusFilterButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.dataset.statusFilter;
        if (!value) {
          return;
        }
        state.filters.status = state.filters.status.includes(value)
          ? state.filters.status.filter((item) => item !== value)
          : [...state.filters.status, value];
        if (state.filters.status.length === 0) {
          state.filters.status = [...DEFAULT_BOARD_FILTERS.status];
        }
        saveBoardFilters();
        syncStatusFilter();
        syncActiveFilterStyles();
        collapseFilterWhenToolbarIsTight(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions);
        await options.refreshBoardDetail();
      });
    });
    elements.statusFilterClearButton.addEventListener("click", async () => {
      state.filters.status = [...DEFAULT_BOARD_FILTERS.status];
      saveBoardFilters();
      syncStatusFilter();
      syncActiveFilterStyles();
      collapseFilter(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions);
      saveBoardFilterExpansion();
      await options.refreshBoardDetail();
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
        collapseFilterWhenToolbarIsTight(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions);
        await options.refreshBoardDetail();
      });
    });
    elements.priorityFilterClearButton.addEventListener("click", async () => {
      state.filters.priority = [];
      saveBoardFilters();
      syncPriorityFilter();
      syncActiveFilterStyles();
      collapseFilter(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions);
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
      collapseFilter(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions);
      collapseFilter(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions);
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

  function syncStatusFilter() {
    elements.statusFilterButtons.forEach((button) => {
      button.classList.toggle("active", state.filters.status.includes(button.dataset.statusFilter ?? ""));
      button.setAttribute("aria-pressed", String(state.filters.status.includes(button.dataset.statusFilter ?? "")));
    });
    const selectedLabels = Object.keys(STATUS_LABELS).filter((key) => state.filters.status.includes(key)).map((key) => STATUS_LABELS[key]).join(" + ") || DEFAULT_BOARD_FILTERS.status.map((key) => STATUS_LABELS[key]).join(" + ");
    elements.statusFilterSummary.textContent = state.filters.status.length === 3 ? tr("All") : selectedLabels;
    elements.statusFilterSummary.title = selectedLabels;
    elements.statusFilterToggles.forEach((toggle) => {
      toggle.setAttribute("aria-label", tr("Status: {labels}", { labels: selectedLabels }));
    });
    elements.statusFilterClearButton.hidden = isDefaultStatusFilter();
  }

  function toggleFilterExpansion(filter, toggles, optionsElement) {
    syncFilterExpansion(filter, toggles, optionsElement, !isFilterExpanded(toggles));
  }

  function collapseFilter(filter, toggles, optionsElement) {
    syncFilterExpansion(filter, toggles, optionsElement, false);
  }

  function collapseFilterWhenToolbarIsTight(filter, toggles, optionsElement) {
    const toolbarFilters = filter.closest(".toolbar-filters");
    if (!toolbarFilters || toolbarFilters.getBoundingClientRect().width > 620) {
      return;
    }
    collapseFilter(filter, toggles, optionsElement);
    saveBoardFilterExpansion();
  }

  function isFilterExpanded(toggles) {
    return toggles[0]?.getAttribute("aria-expanded") === "true";
  }

  function syncFilterExpansion(filter, toggles, optionsElement, expanded) {
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    filter.classList.toggle("is-expanded", expanded);
    optionsElement.hidden = !expanded;
    filter.querySelector(".filter-menu-edge-toggle use")?.setAttribute("href", expanded ? "/icons.svg#chevron-left" : "/icons.svg#chevron-right");
  }

  function syncSearchClearButton() {
    elements.searchClearButton.hidden = state.filters.q === "";
  }

  function syncActiveFilterStyles() {
    elements.searchInput.closest(".toolbar-search")?.classList.toggle("is-filter-active", state.filters.q !== "");
    elements.laneFilter.classList.toggle("is-filter-active", state.viewMode === "list" && state.filters.lane !== "");
    elements.statusFilter.classList.toggle("is-filter-active", !isDefaultStatusFilter());
    elements.priorityFilter.classList.toggle("is-filter-active", state.filters.priority.length > 0);
    elements.tagFilter.classList.toggle("is-filter-active", state.filters.tag !== "");
    elements.resetFiltersButton.hidden = !hasActiveTicketFilters();
  }

  function isDefaultStatusFilter() {
    return state.filters.status.length === 2 && state.filters.status.includes("open") && state.filters.status.includes("resolved");
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

  function matchesStatusFilter(ticket) {
    const status = state.filters.status;
    return status.some((item) => {
      if (item === "archived") {
        return ticket.isArchived;
      }
      if (item === "resolved") {
        return !ticket.isArchived && ticket.isResolved;
      }
      return !ticket.isArchived && !ticket.isResolved;
    });
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
    syncStatusFilter,
    syncViewMode,
  };
}
