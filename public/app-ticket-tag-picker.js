import { icon } from "./icons.js";
import { formatTagLabel, tagBackgroundStyle, tagToneClass } from "./app-tags.js";

export function renderTicketTagChip(tag, escapeHtml) {
  const { name, label } = formatTagLabel(tag);
  const fullName = escapeHtml(name);
  return `<button type="button" class="ticket-tag-chip${tagToneClass(tag)}" data-remove-tag-id="${tag.id}"${tagBackgroundStyle(tag, escapeHtml)} title="Remove tag: ${fullName}" aria-label="Remove tag: ${fullName}"><span class="ticket-tag-chip-text" aria-hidden="true">${escapeHtml(label)}</span>${icon("x")}</button>`;
}

export function createTicketTagPicker(ctx) {
  const { state, elements } = ctx;

  function syncOptions() {
    if (!state.boardDetail) {
      return;
    }
    const availableTagIds = new Set(state.boardDetail.tags.map((tag) => tag.id));
    state.editorTagIds = state.editorTagIds.filter((id) => availableTagIds.has(id));
    const selectedTags = state.boardDetail.tags.filter((tag) => state.editorTagIds.includes(tag.id));
    elements.ticketTagSummary.innerHTML = selectedTags.length
      ? selectedTags.map((tag) => renderTicketTagChip(tag, ctx.escapeHtml)).join("")
      : "";

    const query = state.tagQuery.trim().toLowerCase();
    const createLabel = state.tagQuery.trim();
    const hasExactMatch = state.boardDetail.tags.some((tag) => tag.name.toLowerCase() === query);

    if (state.boardDetail.tags.length === 0 && !createLabel) {
      elements.ticketTagOptions.innerHTML = '<div class="tag-picker-empty">Type a tag name to create it</div>';
      return;
    }

    const visibleTags = state.boardDetail.tags.filter((tag) => {
      if (state.editorTagIds.includes(tag.id)) {
        return true;
      }
      if (!query) {
        return true;
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
      : '<div class="tag-picker-empty">No matching tags</div>';
    const createHtml = createLabel && !hasExactMatch
      ? `
        <button type="button" class="tag-picker-item tag-picker-create" data-create-tag-from-query="${ctx.escapeHtml(createLabel)}">
          ${icon("plus")}
          <span>Create "${ctx.escapeHtml(createLabel)}"</span>
        </button>
      `
      : "";
    elements.ticketTagOptions.innerHTML = `${optionHtml}${createHtml}`;
  }

  function openOptions() {
    ctx.closePeerOptions();
    elements.ticketTagOptions.hidden = false;
    elements.ticketTagToggle.setAttribute("aria-expanded", "true");
  }

  function closeOptions() {
    elements.ticketTagOptions.hidden = true;
    elements.ticketTagToggle.setAttribute("aria-expanded", "false");
  }

  function handleFieldClick(event) {
    const removeButton = event.target.closest("[data-remove-tag-id]");
    if (removeButton) {
      event.preventDefault();
      toggleTag(Number(removeButton.dataset.removeTagId));
      return;
    }
    openOptions();
    elements.ticketTagSearch.focus();
  }

  function handleSearchInput(event) {
    state.tagQuery = event.target.value;
    openOptions();
    syncOptions();
  }

  function handleSearchKeydown(event) {
    if (event.key === "Backspace" && !elements.ticketTagSearch.value && state.editorTagIds.length > 0) {
      event.preventDefault();
      state.editorTagIds = state.editorTagIds.slice(0, -1);
      syncOptions();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      selectFirstOption(event);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeOptions();
      elements.ticketTagSearch.blur();
    }
  }

  function selectFirstOption(event) {
    const firstOption = elements.ticketTagOptions.querySelector("[data-tag-id]");
    event?.preventDefault?.();
    if (firstOption) {
      toggleTag(Number(firstOption.dataset.tagId));
      return true;
    }
    const createOption = elements.ticketTagOptions.querySelector("[data-create-tag-from-query]");
    if (createOption) {
      createTagByName(createOption.dataset.createTagFromQuery);
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
    state.tagQuery = "";
    elements.ticketTagSearch.value = "";
    syncOptions();
    openOptions();
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
      createTagByName(createOption.dataset.createTagFromQuery);
      return true;
    }
    return false;
  }

  async function createTagByName(name) {
    const tagName = String(name ?? "").trim();
    if (!state.activeBoardId || !tagName) {
      return;
    }
    const existingTag = state.boardDetail?.tags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase());
    if (existingTag) {
      toggleTag(existingTag.id);
      return;
    }
    const created = await ctx.sendJson(`/api/boards/${state.activeBoardId}/tags`, {
      method: "POST",
      body: { name: tagName, color: "" },
    });
    await ctx.refreshBoardDetail();
    state.editorTagIds = [...new Set([...state.editorTagIds, created.id])];
    state.tagQuery = "";
    elements.ticketTagSearch.value = "";
    syncOptions();
    openOptions();
    ctx.showToast("Tag created");
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
