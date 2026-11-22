import { t } from "./app-i18n.js";
import { createTicketRelationPicker } from "./app-ticket-relation-picker.js";
import { createTicketRelationRenderers } from "./app-ticket-relation-renderers.js";

export function createTicketRelationsModule(ctx, options) {
  const { state, elements } = ctx;

  let candidateTickets = null;
  let selectedTickets = new Map();
  let candidateStatus = "idle";
  let candidateRequest = null;
  let candidateController = null;
  let candidateGeneration = 0;
  let candidateBoardId = null;
  let candidateViewMode = null;

  function resetCandidates(ticket = null) {
    candidateGeneration += 1;
    candidateController?.abort();
    candidateController = null;
    candidateRequest = null;
    candidateTickets = null;
    candidateStatus = "idle";
    candidateBoardId = state.activeBoardId;
    candidateViewMode = state.viewMode;
    selectedTickets = new Map([
      ticket?.parent, ...(ticket?.children ?? []), ...(ticket?.blockers ?? []),
      ...(ticket?.blockedBy ?? []), ...(ticket?.related ?? []),
    ].filter(Boolean).map((entry) => [entry.id, entry]));
  }

  function isCandidateContextCurrent() {
    return elements.editorDialog.open && candidateBoardId === state.activeBoardId
      && candidateViewMode === state.viewMode;
  }

  function getCandidateStatus() {
    return isCandidateContextCurrent() ? candidateStatus : "idle";
  }

  function syncCandidateOptions() {
    // Only refresh candidate options. Do not replace focused summary chips, hydrate inputs,
    // reopen closed pickers or change the user's relationship selections.
    parentPicker.syncOptions(false);
    blockerPicker.syncOptions(false);
    relatedPicker.syncOptions(false);
    childPicker.syncOptions(false);
  }

  function ensureCandidates(retry = false) {
    if (!isCandidateContextCurrent()) return Promise.resolve();
    if (candidateRequest) return candidateRequest;
    if (candidateStatus === "ready" || (candidateStatus === "error" && !retry)) return Promise.resolve();
    const generation = candidateGeneration;
    const controller = new AbortController();
    candidateController = controller;
    candidateStatus = "loading";
    syncCandidateOptions();
    candidateRequest = ctx.api(`/api/boards/${candidateBoardId}/tickets?archived=all`, { signal: controller.signal })
      .then((result) => {
        if (generation !== candidateGeneration || !isCandidateContextCurrent()) return;
        // Publish only the complete collection; partial board pages are not candidates.
        candidateTickets = result.tickets;
        candidateStatus = "ready";
        syncCandidateOptions();
      }).catch(() => {
        if (generation !== candidateGeneration || !isCandidateContextCurrent() || controller.signal.aborted) return;
        candidateStatus = "error";
        syncCandidateOptions();
      }).finally(() => {
        if (generation === candidateGeneration) {
          candidateRequest = null;
          candidateController = null;
        }
      });
    return candidateRequest;
  }

  function getBoardTickets() {
    return getCandidateStatus() === "ready" ? candidateTickets ?? [] : [];
  }

  function getTicketById(ticketId) {
    return getBoardTickets().find((ticket) => ticket.id === ticketId) ?? selectedTickets.get(ticketId) ?? null;
  }

  const {
    matchTicketQuery,
    renderTicketOption,
    renderTicketSummaryChip,
  } = createTicketRelationRenderers(ctx);

  function getAvailableBlockerTickets() {
    const currentId = state.editingTicketId;
    return getBoardTickets()
      .filter((ticket) => ticket.id !== currentId)
      .filter((ticket) => currentId == null || !ticket.blockerIds.includes(currentId))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function getSelectedParentId() {
    return elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
  }

  function getActiveRelationTypes(ticket = state.dialogTicket) {
    const activeTypes = [];
    if ((ticket?.blockerIds ?? state.editorBlockerIds).length > 0) {
      activeTypes.push("blocker");
    }
    if ((ticket?.relatedIds ?? state.editorRelatedIds).length > 0) {
      activeTypes.push("related");
    }
    if ((ticket?.parentTicketId ?? getSelectedParentId()) != null) {
      activeTypes.push("parent");
    }
    if ((ticket?.children ?? state.editorChildIds).length > 0) {
      activeTypes.push("child");
    }
    return activeTypes;
  }

  function isRelationTypeVisible(type) {
    return state.editorVisibleRelationTypes.includes(type) || getActiveRelationTypes().includes(type);
  }

  function hasSelectedParent() {
    return getSelectedParentId() != null;
  }

  function hasSelectedChildren() {
    return state.editorChildIds.length > 0;
  }

  function canAddRelationType(type, visibleTypes = new Set(getActiveRelationTypes())) {
    if (visibleTypes.has(type)) {
      return false;
    }
    if (type === "parent" && hasSelectedChildren()) {
      return false;
    }
    if (type === "child" && hasSelectedParent()) {
      return false;
    }
    return true;
  }

  function showRelationType(type) {
    if (!canAddRelationType(type, new Set([
      ...state.editorVisibleRelationTypes,
      ...getActiveRelationTypes(),
    ]))) {
      syncRelationRows();
      closeRelationAddOptions();
      return;
    }
    if (!state.editorVisibleRelationTypes.includes(type)) {
      state.editorVisibleRelationTypes = [...state.editorVisibleRelationTypes, type];
    }
    syncRelationRows();
    closeRelationAddOptions();
    const searchByType = {
      blocker: elements.ticketBlockerSearch,
      related: elements.ticketRelatedSearch,
      parent: elements.ticketParentSearch,
      child: elements.ticketChildSearch,
    };
    searchByType[type]?.focus();
  }

  function handleAddRelation() {
    if (elements.ticketRelationAddButton.disabled) {
      return;
    }
    const isOpen = elements.ticketRelationAdd.classList.toggle("is-open");
    elements.ticketRelationAddButton.setAttribute("aria-expanded", String(isOpen));
  }

  function handleAddRelationTypeClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest("[data-relation-add-type]");
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }
    showRelationType(button.dataset.relationAddType || "related");
  }

  function getAvailableParentTickets() {
    return getBoardTickets()
      .filter((ticket) => ticket.id !== state.editingTicketId)
      .filter((ticket) => ticket.parentTicketId == null)
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function setParent(ticketId) {
    elements.ticketParent.value = ticketId == null ? "" : String(ticketId);
    state.parentQuery = "";
    elements.ticketParentSearch.value = "";
    parentPicker.syncOptions();
    handleParentChange();
    parentPicker.openOptions();
    elements.ticketParentSearch.focus();
  }

  function toggleBlocker(ticketId) {
    if (state.editorBlockerIds.includes(ticketId)) {
      state.editorBlockerIds = state.editorBlockerIds.filter((id) => id !== ticketId);
    } else {
      state.editorBlockerIds = [...state.editorBlockerIds, ticketId];
    }
    state.blockerQuery = "";
    elements.ticketBlockerSearch.value = "";
    blockerPicker.syncOptions();
    blockerPicker.openOptions();
    elements.ticketBlockerSearch.focus();
  }

  function getAvailableRelatedTickets() {
    const currentId = state.editingTicketId;
    return getBoardTickets()
      .filter((ticket) => ticket.id !== currentId)
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function toggleRelated(ticketId) {
    if (state.editorRelatedIds.includes(ticketId)) {
      state.editorRelatedIds = state.editorRelatedIds.filter((id) => id !== ticketId);
    } else {
      state.editorRelatedIds = [...state.editorRelatedIds, ticketId];
    }
    state.relatedQuery = "";
    elements.ticketRelatedSearch.value = "";
    relatedPicker.syncOptions();
    relatedPicker.openOptions();
    elements.ticketRelatedSearch.focus();
  }

  function getAvailableChildTickets() {
    if (!state.editingTicketId || getSelectedParentId() != null) {
      return [];
    }
    const tickets = getBoardTickets();
    const parentIds = new Set(tickets.map((ticket) => ticket.parentTicketId));
    return tickets
      .filter((ticket) => ticket.id !== state.editingTicketId)
      .filter((ticket) => state.editorChildIds.includes(ticket.id) || (ticket.parentTicketId == null && !parentIds.has(ticket.id)))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function syncChildPickerAvailability() {
    const canEditChildren = Boolean(state.editingTicketId) && getSelectedParentId() == null;
    elements.ticketChildSearch.disabled = !canEditChildren;
    elements.ticketChildToggle.classList.toggle("is-disabled", !canEditChildren);
    if (!canEditChildren) {
      childPicker.closeOptions();
      if (getSelectedParentId() != null) {
        state.editorChildIds = [];
      }
    }
  }

  function toggleChild(ticketId) {
    if (state.editorChildIds.includes(ticketId)) {
      state.editorChildIds = state.editorChildIds.filter((id) => id !== ticketId);
    } else {
      state.editorChildIds = [...state.editorChildIds, ticketId];
      state.editorSelectedParents ??= {};
      state.editorSelectedParents[ticketId] = getTicketById(ticketId)?.parentTicketId ?? null;
    }
    syncRelationRows();
    state.childQuery = "";
    elements.ticketChildSearch.value = "";
    childPicker.syncOptions();
    childPicker.openOptions();
    elements.ticketChildSearch.focus();
  }

  function handleParentChange() {
    syncChildPickerAvailability();
    childPicker.syncOptions();
    syncRelationRows();
  }

  const relationPickerContext = {
    escapeHtml: ctx.escapeHtml,
    getTicketById,
    getCandidateStatus,
    ensureCandidates,
    matchTicketQuery,
    renderOption: renderTicketOption,
    renderSummaryChip: renderTicketSummaryChip,
  };

  const parentPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-parent-id",
    removeAttr: "data-remove-parent-id",
    elements: {
      toggle: elements.ticketParentToggle,
      summary: elements.ticketParentSummary,
      search: elements.ticketParentSearch,
      options: elements.ticketParentOptions,
    },
    closePeerOptions: () => {
      options.tagPicker.closeOptions();
      blockerPicker.closeOptions();
      relatedPicker.closeOptions();
      childPicker.closeOptions();
    },
    getAvailableTickets: getAvailableParentTickets,
    getPlaceholder: () => "",
    getQuery: () => state.parentQuery,
    getSelectedTicketIds: () => {
      const selectedParentId = getSelectedParentId();
      return selectedParentId == null ? [] : [selectedParentId];
    },
    removeTicket: () => setParent(null),
    selectTicket: setParent,
    setQuery: (value) => {
      state.parentQuery = value;
    },
  });

  const blockerPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-blocker-id",
    removeAttr: "data-remove-blocker-id",
    elements: {
      toggle: elements.ticketBlockerToggle,
      summary: elements.ticketBlockerSummary,
      search: elements.ticketBlockerSearch,
      options: elements.ticketBlockerOptions,
    },
    closePeerOptions: () => {
      options.tagPicker.closeOptions();
      parentPicker.closeOptions();
      relatedPicker.closeOptions();
      childPicker.closeOptions();
    },
    getAvailableTickets: getAvailableBlockerTickets,
    getPlaceholder: () => "",
    getQuery: () => state.blockerQuery,
    getSelectedTicketIds: () => [...state.editorBlockerIds],
    removeTicket: toggleBlocker,
    selectTicket: toggleBlocker,
    setQuery: (value) => {
      state.blockerQuery = value;
    },
  });

  const childPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-child-id",
    removeAttr: "data-remove-child-id",
    elements: {
      toggle: elements.ticketChildToggle,
      summary: elements.ticketChildSummary,
      search: elements.ticketChildSearch,
      options: elements.ticketChildOptions,
    },
    canOpen: () => Boolean(state.editingTicketId) && getSelectedParentId() == null,
    closePeerOptions: () => {
      options.tagPicker.closeOptions();
      parentPicker.closeOptions();
      blockerPicker.closeOptions();
      relatedPicker.closeOptions();
    },
    getAvailableTickets: getAvailableChildTickets,
    getPlaceholder: () => (state.editingTicketId ? (getSelectedParentId() != null ? t("Clear parent to edit children") : "") : t("Save ticket first")),
    getQuery: () => state.childQuery,
    getSelectedTicketIds: () => [...state.editorChildIds],
    getUnavailableMessage: () => (!state.editingTicketId || getSelectedParentId() != null ? t("Children cannot be edited while this ticket has a parent") : ""),
    removeTicket: toggleChild,
    selectTicket: toggleChild,
    setQuery: (value) => {
      state.childQuery = value;
    },
  });

  const relatedPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-related-id",
    removeAttr: "data-remove-related-id",
    elements: {
      toggle: elements.ticketRelatedToggle,
      summary: elements.ticketRelatedSummary,
      search: elements.ticketRelatedSearch,
      options: elements.ticketRelatedOptions,
    },
    closePeerOptions: () => {
      options.tagPicker.closeOptions();
      parentPicker.closeOptions();
      blockerPicker.closeOptions();
      childPicker.closeOptions();
    },
    getAvailableTickets: getAvailableRelatedTickets,
    getPlaceholder: () => "",
    getQuery: () => state.relatedQuery,
    getSelectedTicketIds: () => [...state.editorRelatedIds],
    removeTicket: toggleRelated,
    selectTicket: toggleRelated,
    setQuery: (value) => {
      state.relatedQuery = value;
    },
  });

  function syncOptions() {
    syncRelationRows();
    parentPicker.syncOptions();
    blockerPicker.syncOptions();
    relatedPicker.syncOptions();
    syncChildPickerAvailability();
    childPicker.syncOptions();
  }

  function closeOptions() {
    parentPicker.closeOptions();
    blockerPicker.closeOptions();
    relatedPicker.closeOptions();
    childPicker.closeOptions();
    closeRelationAddOptions();
  }

  function closeRelationAddOptions() {
    elements.ticketRelationAdd.classList.remove("is-open");
    elements.ticketRelationAddButton.setAttribute("aria-expanded", "false");
  }

  function syncRelationRows() {
    if (hasSelectedChildren()) {
      state.editorVisibleRelationTypes = state.editorVisibleRelationTypes.filter((type) => type !== "parent");
    }
    if (hasSelectedParent()) {
      state.editorVisibleRelationTypes = state.editorVisibleRelationTypes.filter((type) => type !== "child");
    }
    elements.ticketBlockerRow.hidden = !isRelationTypeVisible("blocker");
    elements.ticketRelatedRow.hidden = !isRelationTypeVisible("related");
    elements.ticketParentRow.hidden = hasSelectedChildren() || !isRelationTypeVisible("parent");
    elements.ticketChildrenRow.hidden = hasSelectedParent() || !isRelationTypeVisible("child");
    const visibleTypes = new Set([
      ...state.editorVisibleRelationTypes,
      ...getActiveRelationTypes(),
    ]);
    const relationButtons = [...elements.ticketRelationAddOptions.querySelectorAll("[data-relation-add-type]")];
    relationButtons.forEach((button) => {
      const isUnavailable = !canAddRelationType(button.dataset.relationAddType, visibleTypes);
      button.hidden = isUnavailable;
      button.disabled = isUnavailable;
    });
    const hasAvailableType = relationButtons.some((button) => !button.disabled);
    elements.ticketRelationAddButton.disabled = !hasAvailableType;
    elements.ticketRelationAdd.hidden = !hasAvailableType;
    if (!hasAvailableType) {
      closeRelationAddOptions();
    }
  }

  function handleOptionClick(event) {
    return blockerPicker.handleOptionClick(event) ||
      relatedPicker.handleOptionClick(event) ||
      childPicker.handleOptionClick(event) ||
      parentPicker.handleOptionClick(event);
  }

  function containsTarget(target) {
    return elements.ticketParentToggle.contains(target) ||
      elements.ticketParentOptions.contains(target) ||
      elements.ticketBlockerToggle.contains(target) ||
      elements.ticketBlockerOptions.contains(target) ||
      elements.ticketRelatedToggle.contains(target) ||
      elements.ticketRelatedOptions.contains(target) ||
      elements.ticketRelationAdd.contains(target) ||
      elements.ticketChildToggle.contains(target) ||
      elements.ticketChildOptions.contains(target);
  }

  return {
    closeOptions,
    containsTarget,
    getActiveRelationTypes,
    resetCandidates,
    handleAddRelation,
    handleAddRelationTypeClick,
    handleBlockerFieldClick: blockerPicker.handleFieldClick,
    handleBlockerSearchInput: blockerPicker.handleSearchInput,
    handleBlockerSearchKeydown: blockerPicker.handleSearchKeydown,
    handleChildFieldClick: childPicker.handleFieldClick,
    handleChildSearchInput: childPicker.handleSearchInput,
    handleChildSearchKeydown: childPicker.handleSearchKeydown,
    handleOptionClick,
    handleParentChange,
    handleParentFieldClick: parentPicker.handleFieldClick,
    handleParentSearchInput: parentPicker.handleSearchInput,
    handleParentSearchKeydown: parentPicker.handleSearchKeydown,
    handleRelatedFieldClick: relatedPicker.handleFieldClick,
    handleRelatedSearchInput: relatedPicker.handleSearchInput,
    handleRelatedSearchKeydown: relatedPicker.handleSearchKeydown,
    openBlockerOptions: blockerPicker.openOptions,
    openChildOptions: childPicker.openOptions,
    openParentOptions: parentPicker.openOptions,
    openRelatedOptions: relatedPicker.openOptions,
    syncOptions,
  };
}
