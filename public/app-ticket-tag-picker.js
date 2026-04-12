import { icon } from "./icons.js";
import { tagBackgroundStyle, tagToneClass } from "./app-tags.js";

export function createTicketTagPicker(ctx) {
  const { state, elements } = ctx;

  function renderTagSummaryChip(tag) {
    return `<button type="button" class="ticket-tag-chip${tagToneClass(tag)}" data-remove-tag-id="${tag.id}"${tagBackgroundStyle(tag, ctx.escapeHtml)} title="Remove ${ctx.escapeHtml(tag.name)}">${ctx.escapeHtml(tag.name)} ${icon("x")}</button>`;
  }

  function syncOptions() {
    if (!state.boardDetail) {
      return;
    }
    const availableTagIds = new Set(state.boardDetail.tags.map((tag) => tag.id));
    state.editorTagIds = state.editorTagIds.filter((id) => availableTagIds.has(id));
    const selectedTags = state.boardDetail.tags.filter((tag) => state.editorTagIds.includes(tag.id));
    elements.ticketTagSummary.innerHTML = selectedTags.length
      ? selectedTags.map(renderTagSummaryChip).join("")
      : '<span class="ticket-tag-placeholder">Add tags</span>';

    if (state.boardDetail.tags.length === 0) {
      elements.ticketTagOptions.innerHTML = '<div class="tag-picker-empty">No tags</div>';
      return;
    }

    const query = state.tagQuery.trim().toLowerCase();
    const visibleTags = state.boardDetail.tags.filter((tag) => {
      if (state.editorTagIds.includes(tag.id)) {
        return true;
      }
      if (!query) {
        return true;
      }
      return tag.name.toLowerCase().includes(query);
    });

    elements.ticketTagOptions.innerHTML = visibleTags.length
      ? visibleTags
          .map((tag) => {
            const isSelected = state.editorTagIds.includes(tag.id);
            return `
              <button type="button" class="tag-picker-item ${isSelected ? "selected" : ""}" data-tag-id="${tag.id}" role="option" aria-selected="${isSelected}">
                <span class="tag-picker-swatch${tagToneClass(tag)}"${tagBackgroundStyle(tag, ctx.escapeHtml)}></span>
                <span class="tag-picker-text">${ctx.escapeHtml(tag.name)}</span>
                <span class="tag-picker-check" aria-hidden="true">${isSelected ? icon("check") : ""}</span>
              </button>
            `;
          })
          .join("")
      : '<div class="tag-picker-empty">No matching tags</div>';
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
    if (!firstOption) {
      return false;
    }
    event?.preventDefault?.();
    toggleTag(Number(firstOption.dataset.tagId));
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
    if (!option || !elements.ticketTagOptions.contains(option)) {
      return false;
    }
    toggleTag(Number(option.dataset.tagId));
    return true;
  }

  async function createTagFromEditor() {
    if (!state.activeBoardId) {
      return;
    }
    const values = await ctx.requestFields({
      title: "New Tag",
      submitLabel: "Create",
      fields: [
        { id: "name", label: "Name", required: true },
        { id: "color", label: "Color", type: "color", value: "#1f6f5f", required: true, allowNone: true, enabled: false },
      ],
    });
    if (!values) {
      return;
    }
    const created = await ctx.sendJson(`/api/boards/${state.activeBoardId}/tags`, {
      method: "POST",
      body: values,
    });
    await ctx.refreshBoardDetail();
    state.editorTagIds = [...new Set([...state.editorTagIds, created.id])];
    syncOptions();
    ctx.showToast("Tag created");
  }

  return {
    closeOptions,
    createTagFromEditor,
    handleFieldClick,
    handleOptionClick,
    handleSearchInput,
    handleSearchKeydown,
    openOptions,
    syncOptions,
  };
}
