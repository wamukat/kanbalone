export function createFiltersModule(ctx, options) {
  const { state, elements } = ctx;
  const STATUS_LABELS = {
    open: "Open",
    resolved: "Resolved",
    archived: "Archived",
  };
  const PRIORITY_LABELS = {
    low: "Low",
    medium: "Medium",
    high: "High",
    urgent: "Urgent",
  };

  function syncViewMode() {
    elements.viewModeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
    });
    elements.laneBoard.hidden = state.viewMode !== "kanban";
    elements.listBoard.hidden = state.viewMode !== "list";
    elements.laneFilter.hidden = state.viewMode !== "list";
  }

  function resetBoardFilters() {
    state.filters = { q: "", lane: "", status: ["open"], priority: [], tag: "" };
    elements.searchInput.value = "";
    elements.laneFilter.value = "";
    syncStatusFilter();
    syncPriorityFilter();
    elements.tagFilter.value = "";
    syncActiveFilterStyles();
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
        if (state.viewMode !== "list") {
          state.filters.lane = "";
          elements.laneFilter.value = "";
        }
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
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.laneFilter.addEventListener("change", async (event) => {
      state.filters.lane = event.target.value;
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.statusFilterToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        toggleFilterExpansion(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions);
      });
    });
    elements.priorityFilterToggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        toggleFilterExpansion(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions);
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
          state.filters.status = ["open"];
        }
        syncStatusFilter();
        syncActiveFilterStyles();
        await options.refreshBoardDetail();
      });
    });
    elements.statusFilterClearButton.addEventListener("click", async () => {
      state.filters.status = ["open"];
      syncStatusFilter();
      syncActiveFilterStyles();
      collapseFilter(elements.statusFilter, elements.statusFilterToggles, elements.statusFilterOptions);
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
        syncPriorityFilter();
        syncActiveFilterStyles();
        await options.refreshBoardDetail();
      });
    });
    elements.priorityFilterClearButton.addEventListener("click", async () => {
      state.filters.priority = [];
      syncPriorityFilter();
      syncActiveFilterStyles();
      collapseFilter(elements.priorityFilter, elements.priorityFilterToggles, elements.priorityFilterOptions);
      await options.refreshBoardDetail();
    });
    elements.tagFilter.addEventListener("change", async (event) => {
      state.filters.tag = event.target.value;
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
  }

  function syncPriorityFilter() {
    elements.priorityFilterButtons.forEach((button) => {
      button.classList.toggle("active", state.filters.priority.includes(button.dataset.priorityFilter ?? ""));
    });
    elements.priorityFilterSummary.textContent = summarizeFilter(state.filters.priority, PRIORITY_LABELS, "Any");
    elements.priorityFilterClearButton.hidden = state.filters.priority.length === 0;
  }

  function syncStatusFilter() {
    elements.statusFilterButtons.forEach((button) => {
      button.classList.toggle("active", state.filters.status.includes(button.dataset.statusFilter ?? ""));
    });
    elements.statusFilterSummary.textContent = summarizeFilter(state.filters.status, STATUS_LABELS, "Open");
    elements.statusFilterClearButton.hidden = isDefaultStatusFilter();
  }

  function toggleFilterExpansion(filter, toggles, optionsElement) {
    const expanded = toggles[0].getAttribute("aria-expanded") === "true";
    if (expanded) {
      collapseFilter(filter, toggles, optionsElement);
      return;
    }
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", "true");
    });
    filter.classList.add("is-expanded");
    optionsElement.hidden = false;
    filter.querySelector(".filter-menu-edge-toggle use")?.setAttribute("href", "/icons.svg#chevron-left");
  }

  function collapseFilter(filter, toggles, optionsElement) {
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", "false");
    });
    filter.classList.remove("is-expanded");
    optionsElement.hidden = true;
    filter.querySelector(".filter-menu-edge-toggle use")?.setAttribute("href", "/icons.svg#chevron-right");
  }

  function syncActiveFilterStyles() {
    elements.searchInput.closest(".toolbar-search")?.classList.toggle("is-filter-active", state.filters.q !== "");
    elements.laneFilter.classList.toggle("is-filter-active", state.viewMode === "list" && state.filters.lane !== "");
    elements.statusFilter.classList.toggle("is-filter-active", !isDefaultStatusFilter());
    elements.priorityFilter.classList.toggle("is-filter-active", state.filters.priority.length > 0);
    elements.tagFilter.classList.toggle("is-filter-active", state.filters.tag !== "");
  }

  function isDefaultStatusFilter() {
    return state.filters.status.length === 1 && state.filters.status[0] === "open";
  }

  function summarizeFilter(values, labels, fallback) {
    if (!values.length) {
      return fallback;
    }
    if (values.length === 1) {
      return labels[values[0]] ?? values[0];
    }
    return `${values.length} selected`;
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
        return ticket.priority >= 4;
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
    resetBoardFilters,
    syncActiveFilterStyles,
    syncStatusFilter,
    syncViewMode,
  };
}
