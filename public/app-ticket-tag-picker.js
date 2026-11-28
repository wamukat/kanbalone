import { t } from "./app-i18n.js";
import { icon } from "./icons.js";
import { formatTagLabel, tagBackgroundStyle, tagToneClass } from "./app-tags.js";

export function renderTicketTagChip(tag, escapeHtml) {
  const { name, label } = formatTagLabel(tag);
  const fullName = escapeHtml(name);
  return `<button type="button" class="ticket-tag-chip${tagToneClass(tag)}" data-remove-tag-id="${tag.id}"${tagBackgroundStyle(tag, escapeHtml)} title="${t("Remove tag: {name}", { name: fullName })}" aria-label="${t("Remove tag: {name}", { name: fullName })}"><span class="ticket-tag-chip-text" aria-hidden="true">${escapeHtml(label)}</span>${icon("x")}</button>`;
}

export function createTicketTagPicker(ctx) {
  const { state, elements } = ctx;
  let activeOptionIndex = 0;

  function renderDraftTagChip(name) {
    const { label } = formatTagLabel({ name });
    const fullName = ctx.escapeHtml(name);
    const removeLabel = ctx.escapeHtml(t("Remove unsaved tag: {name}", { name }));
    return `<button type="button" class="ticket-tag-chip ticket-tag-chip-draft" data-remove-tag-draft="${fullName}" title="${removeLabel}" aria-label="${removeLabel}"><span class="ticket-tag-chip-text" aria-hidden="true">${ctx.escapeHtml(label)}</span><span class="ticket-tag-chip-draft-status" aria-hidden="true">${t("Unsaved")}</span>${icon("x")}</button>`;
  }

  function syncOptions() {
    if (!state.boardDetail) {
      return;
    }
    const availableTagIds = new Set(state.boardDetail.tags.map((tag) => tag.id));
    state.editorTagIds = state.editorTagIds.filter((id) => availableTagIds.has(id));
    const selectedTags = state.boardDetail.tags.filter((tag) => state.editorTagIds.includes(tag.id));
    const pendingNames = state.editorTagDraftNames;
    elements.ticketTagSummary.innerHTML = [
      ...selectedTags.map((tag) => renderTicketTagChip(tag, ctx.escapeHtml)),
      ...pendingNames.map(renderDraftTagChip),
    ].join("");
    elements.ticketTagDraftHelp.hidden = pendingNames.length === 0;
    if (pendingNames.length) {
      elements.ticketTagSearch.setAttribute("aria-describedby", elements.ticketTagDraftHelp.id);
    } else {
      elements.ticketTagSearch.removeAttribute("aria-describedby");
    }

    const query = state.tagQuery.trim().toLowerCase();
    const createLabel = state.tagQuery.trim();
    const pendingKeys = new Set(pendingNames.map((name) => name.toLowerCase()));
    const hasExactMatch = pendingKeys.has(query) || state.boardDetail.tags.some((tag) => tag.name.toLowerCase() === query);

    if (!createLabel) {
      elements.ticketTagOptions.innerHTML = "";
      activeOptionIndex = 0;
      return;
    }

    const visibleTags = state.boardDetail.tags.filter((tag) => {
      if (state.editorTagIds.includes(tag.id) || pendingKeys.has(tag.name.toLowerCase())) {
        return false;
      }
      return tag.name.toLowerCase().includes(query);
    });

    const optionHtml = visibleTags.length
      ? visibleTags
          .map((tag) => {
            const isSelected = state.editorTagIds.includes(tag.id);
            const { name, label } = formatTagLabel(tag);
            return `
              <button type="button" class="tag-picker-item ${isSelected ? "selected" : ""}" data-tag-id="${tag.id}" role="option" aria-selected="${isSelected}" title="${ctx.escapeHtml(name)}" aria-label="${ctx.escapeHtml(name)}">
                <span class="tag-picker-swatch${tagToneClass(tag)}"${tagBackgroundStyle(tag, ctx.escapeHtml)}></span>
                <span class="tag-picker-text" aria-hidden="true">${ctx.escapeHtml(label)}</span>
                <span class="tag-picker-check" aria-hidden="true">${isSelected ? icon("check") : ""}</span>
              </button>
            `;
          })
          .join("")
      : `<div class="tag-picker-empty">${t("No matching tags")}</div>`;
    const createHtml = createLabel && !hasExactMatch
      ? `
        <button type="button" class="tag-picker-item tag-picker-create" data-create-tag-from-query="${ctx.escapeHtml(createLabel)}">
          ${icon("plus")}
          <span>${ctx.escapeHtml(t('Create "{name}"', { name: createLabel }))}</span>
        </button>
      `
      : "";
    elements.ticketTagOptions.innerHTML = `${optionHtml}${createHtml}`;
    syncActiveOption();
  }

  function openOptions() {
    ctx.closePeerOptions();
    elements.ticketTagOptions.hidden = false;
    elements.ticketTagToggle.setAttribute("aria-expanded", "true");
  }

  function closeOptions() {
    elements.ticketTagOptions.hidden = true;
    elements.ticketTagToggle.setAttribute("aria-expanded", "false");
    activeOptionIndex = 0;
  }

  function handleFieldClick(event) {
    const removeDraftButton = event.target.closest("[data-remove-tag-draft]");
    if (removeDraftButton) {
      const name = removeDraftButton.dataset.removeTagDraft;
      state.editorTagDraftNames = state.editorTagDraftNames.filter((draft) => draft !== name);
      syncOptions();
      elements.ticketTagSearch.focus();
      return;
    }
    const removeButton = event.target.closest("[data-remove-tag-id]");
    if (removeButton) {
      event.preventDefault();
      toggleTag(Number(removeButton.dataset.removeTagId));
      return;
    }
    ctx.closePeerOptions();
    elements.ticketTagSearch.focus();
  }

  function handleSearchInput(event) {
    state.tagQuery = event.target.value;
    syncOptions();
    if (state.tagQuery.trim()) {
      openOptions();
    } else {
      closeOptions();
    }
  }

  function handleSearchKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Backspace" && !elements.ticketTagSearch.value && state.editorTagDraftNames.length > 0) {
      event.preventDefault();
      state.editorTagDraftNames.pop();
      syncOptions();
      return;
    }
    if (event.key === "Backspace" && !elements.ticketTagSearch.value && state.editorTagIds.length > 0) {
      event.preventDefault();
      state.editorTagIds = state.editorTagIds.slice(0, -1);
      syncOptions();
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
      selectActiveOption(event);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeOptions();
      elements.ticketTagSearch.blur();
    }
  }

  function getOptionButtons() {
    return [...elements.ticketTagOptions.querySelectorAll("[data-tag-id], [data-create-tag-from-query]")];
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

  function selectActiveOption(event) {
    const options = getOptionButtons();
    const option = options[activeOptionIndex] ?? options[0];
    event?.preventDefault?.();
    if (!option) {
      return true;
    }
    if (option.dataset.tagId) {
      toggleTag(Number(option.dataset.tagId));
      return true;
    }
    if (option.dataset.createTagFromQuery) {
      stageTagName(option.dataset.createTagFromQuery);
      return true;
    }
    return true;
  }

  function toggleTag(tagId) {
    if (state.editorTagIds.includes(tagId)) {
      state.editorTagIds = state.editorTagIds.filter((id) => id !== tagId);
    } else {
      state.editorTagIds = [...state.editorTagIds, tagId];
    }
    finishTagSelection();
  }

  function finishTagSelection() {
    state.tagQuery = "";
    elements.ticketTagSearch.value = "";
    syncOptions();
    closeOptions();
    elements.ticketTagSearch.focus();
  }

  function handleOptionClick(event) {
    const option = event.target.closest?.("[data-tag-id]");
    if (option && elements.ticketTagOptions.contains(option)) {
      toggleTag(Number(option.dataset.tagId));
      return true;
    }
    const createOption = event.target.closest?.("[data-create-tag-from-query]");
    if (createOption && elements.ticketTagOptions.contains(createOption)) {
      stageTagName(createOption.dataset.createTagFromQuery);
      return true;
    }
    return false;
  }

  function stageTagName(name) {
    const tagName = String(name ?? "").trim();
    if (!state.activeBoardId || !tagName) {
      return;
    }
    const existingTag = state.boardDetail?.tags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase());
    if (existingTag) {
      toggleTag(existingTag.id);
      return;
    }
    if (!state.editorTagDraftNames.some((draft) => draft.toLowerCase() === tagName.toLowerCase())) {
      state.editorTagDraftNames.push(tagName);
    }
    finishTagSelection();
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
