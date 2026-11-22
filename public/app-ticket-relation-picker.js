import { t } from "./app-i18n.js";
export function createTicketRelationPicker(ctx) {
  const { elements } = ctx;
  let activeOptionIndex = 0;

  function getSelectedTickets() {
    return ctx.getSelectedTicketIds().map(ctx.getTicketById).filter(Boolean);
  }

  function syncOptions(refreshSummary = true) {
    const selectedIds = ctx.getSelectedTicketIds();
    const selectedTickets = getSelectedTickets();
    const placeholder = ctx.getPlaceholder();
    if (refreshSummary) elements.summary.innerHTML = selectedTickets.length
      ? selectedTickets.map((ticket) => ctx.renderSummaryChip(ticket, ctx.removeAttr)).join("")
      : placeholder
        ? `<span class="ticket-tag-placeholder">${ctx.escapeHtml(placeholder)}</span>`
        : "";

    if (ctx.getUnavailableMessage) {
      const message = ctx.getUnavailableMessage();
      if (message) {
        elements.options.innerHTML = `<div class="tag-picker-empty">${ctx.escapeHtml(message)}</div>`;
        return;
      }
    }

    elements.options.removeAttribute("aria-busy");
    const query = ctx.getQuery().trim();
    if (!query) {
      elements.options.innerHTML = "";
      activeOptionIndex = 0;
      return;
    }

    const candidateStatus = ctx.getCandidateStatus();
    if (candidateStatus !== "ready") {
      if (candidateStatus === "error") {
        elements.options.innerHTML = `<div class="tag-picker-empty ticket-relation-status"><span role="status" title="${t("Could not load tickets")}">${t("Could not load tickets")}</span><button type="button" class="ghost" data-retry-relation-candidates>${t("Try again")}</button></div>`;
      } else {
        elements.options.setAttribute("aria-busy", "true");
        elements.options.innerHTML = `<div class="tag-picker-empty ticket-relation-status"><span role="status" title="${t("Loading tickets...")}">${t("Loading tickets...")}</span></div>`;
      }
      activeOptionIndex = 0;
      return;
    }

    const visibleTickets = ctx.getAvailableTickets().filter((ticket) => {
      if (selectedIds.includes(ticket.id)) {
        return false;
      }
      return ctx.matchTicketQuery(ticket, query);
    });

    elements.options.innerHTML = visibleTickets.length
      ? visibleTickets.map((ticket) => ctx.renderOption(ticket, ctx.optionAttr, selectedIds.includes(ticket.id))).join("")
      : `<div class="tag-picker-empty">${t("No matching tickets")}</div>`;
    syncActiveOption();
  }

  function openOptions() {
    if (ctx.canOpen && !ctx.canOpen()) {
      return;
    }
    ctx.closePeerOptions();
    elements.options.hidden = false;
    elements.toggle.setAttribute("aria-expanded", "true");
  }

  function closeOptions() {
    elements.options.hidden = true;
    elements.toggle.setAttribute("aria-expanded", "false");
    activeOptionIndex = 0;
  }

  function handleFieldClick(event) {
    const removeButton = event.target.closest(`[${ctx.removeAttr}]`);
    if (removeButton) {
      event.preventDefault();
      ctx.removeTicket(Number(removeButton.getAttribute(ctx.removeAttr)));
      return;
    }
    ctx.closePeerOptions();
    elements.search.focus();
  }

  function handleSearchInput(event) {
    ctx.setQuery(event.target.value);
    if (event.target.value.trim()) void ctx.ensureCandidates();
    syncOptions();
    if (event.target.value.trim()) {
      openOptions();
    } else {
      closeOptions();
    }
  }

  function handleSearchKeydown(event) {
    const selectedIds = ctx.getSelectedTicketIds();
    if (event.key === "Backspace" && !elements.search.value && selectedIds.length > 0) {
      event.preventDefault();
      ctx.removeTicket(selectedIds[selectedIds.length - 1]);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      selectActiveOption();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeOptions();
      elements.search.blur();
    }
  }

  function getOptionButtons() {
    return [...elements.options.querySelectorAll(`[${ctx.optionAttr}]`)];
  }

  function syncActiveOption() {
    const options = getOptionButtons();
    if (options.length === 0) {
      activeOptionIndex = 0;
      return;
    }
    activeOptionIndex = Math.min(Math.max(activeOptionIndex, 0), options.length - 1);
    options.forEach((option, index) => {
      const active = index === activeOptionIndex;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
    });
  }

  function moveActiveOption(delta) {
    const options = getOptionButtons();
    if (options.length === 0) {
      return;
    }
    activeOptionIndex = (activeOptionIndex + delta + options.length) % options.length;
    syncActiveOption();
    options[activeOptionIndex]?.scrollIntoView({ block: "nearest" });
  }

  function selectActiveOption() {
    const options = getOptionButtons();
    const option = options[activeOptionIndex] ?? options[0];
    if (!option) {
      return false;
    }
    selectTicket(Number(option.getAttribute(ctx.optionAttr)));
    return true;
  }

  function selectTicket(ticketId) {
    if (ctx.getCandidateStatus() !== "ready") return;
    ctx.selectTicket(ticketId);
    ctx.setQuery("");
    elements.search.value = "";
    syncOptions();
    closeOptions();
    elements.search.focus();
  }

  function handleOptionClick(event) {
    const retry = event.target.closest?.("[data-retry-relation-candidates]");
    if (retry && elements.options.contains(retry)) {
      // The retry button is replaced by the loading message; retain keyboard focus.
      elements.search.focus();
      void ctx.ensureCandidates(true);
      return true;
    }
    const option = event.target.closest?.(`[${ctx.optionAttr}]`);
    if (!option || !elements.options.contains(option)) {
      return false;
    }
    selectTicket(Number(option.getAttribute(ctx.optionAttr)));
    return true;
  }

  return {
    closeOptions,
    handleFieldClick,
    handleOptionClick,
    handleSearchInput,
    handleSearchKeydown,
    openOptions,
    syncOptions,
  };
}
