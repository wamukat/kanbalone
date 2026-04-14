import { tagBackgroundStyle, tagToneClass } from "./app-tags.js";
import { createInlineTextForm } from "./app-inline-text-form.js";
import {
  bindUxColorFieldInteractions,
  getUxColorFieldValue,
  isHexColor,
  isUxColorNoneSelected,
  renderUxColorField,
} from "./app-ux-color-field.js";
import { icon } from "./icons.js";

export function createSidebarTagsModule(ctx) {
  const { state, elements } = ctx;

  function createTag() {
    if (!state.activeBoardId) {
      return;
    }
    state.isCreatingSidebarTag = true;
    state.editingSidebarTagId = null;
    state.confirmingSidebarTagDeleteId = null;
    state.sidebarTagError = "";
    renderSidebarTags();
  }

  function renderSidebarTags() {
    const tags = state.boardDetail?.tags ?? [];
    elements.sidebarTagList.innerHTML = "";

    if (state.isCreatingSidebarTag) {
      elements.sidebarTagList.append(createTagCreateRow());
    }

    if (tags.length === 0 && !state.isCreatingSidebarTag) {
      elements.sidebarTagList.innerHTML = '<p class="tag-manager-empty muted">No tags yet.</p>';
      return;
    }

    for (const tag of tags) {
      const row = document.createElement("div");
      row.className = "sidebar-tag-row";
      if (state.editingSidebarTagId === tag.id) {
        row.append(createTagEditForm(tag));
      } else {
        row.innerHTML = `
          <button type="button" class="sidebar-tag-badge${tagToneClass(tag)}"${tagBackgroundStyle(tag, ctx.escapeHtml)} title="Edit tag: ${ctx.escapeHtml(tag.name)}" aria-label="Edit tag: ${ctx.escapeHtml(tag.name)}">
            <span>${ctx.escapeHtml(tag.name)}</span>
            ${icon("pencil")}
          </button>
        `;
        row.querySelector(".sidebar-tag-badge").addEventListener("click", () => startTagEdit(tag.id));
      }
      elements.sidebarTagList.append(row);
    }
  }

  function createTagCreateRow() {
    const form = createInlineTextForm({
      className: "sidebar-tag-row sidebar-tag-create-row",
      html: '<input id="sidebar-tag-create-input" data-sidebar-tag-name type="text" placeholder="Tag name" aria-label="Tag name" autocomplete="off" />',
      inputSelector: "[data-sidebar-tag-name]",
      onSubmit: submitTagCreate,
      onCancel: cancelTagEdit,
      cancelOnFocusOut: "always",
    });
    form.dataset.sidebarTagCreateForm = "";
    return form;
  }

  function createTagEditForm(tag) {
    const form = document.createElement("form");
    const isConfirmingDelete = state.confirmingSidebarTagDeleteId === tag.id;
    form.className = "sidebar-tag-form ux-fields";
    form.dataset.sidebarTagEditForm = String(tag.id);
    form.innerHTML = `
      ${renderTagPreviewBadge(tag)}
      <input id="sidebar-tag-name-${tag.id}" data-sidebar-tag-name type="text" value="${ctx.escapeHtml(tag.name)}" aria-label="Tag name" autocomplete="off" required />
      ${renderUxColorField({
        id: "color",
        label: "Color",
        value: tag.color || "#1f6f5f",
        required: true,
        type: "color",
        allowNone: true,
        enabled: Boolean(tag.color),
      }, ctx.escapeHtml)}
      ${renderTagError()}
      <div class="sidebar-tag-form-actions sidebar-tag-form-actions-split">
        ${isConfirmingDelete ? `
          <div class="sidebar-tag-delete-confirm">
            <span>Delete this tag?</span>
            <div class="sidebar-tag-delete-confirm-actions">
              <button type="button" class="ghost" data-sidebar-tag-delete-cancel>Cancel</button>
              <button type="button" class="danger action-with-icon danger-confirm-action" data-sidebar-tag-delete-confirm>${icon("trash-2")}<span>Delete</span></button>
            </div>
          </div>
        ` : `
          <button type="button" class="danger icon-button" data-sidebar-tag-delete title="Delete tag" aria-label="Delete tag">${icon("trash-2")}</button>
          <span class="sidebar-tag-action-spacer"></span>
          <button type="button" class="ghost" data-sidebar-tag-cancel>Cancel</button>
          <button type="submit" class="primary-action">Save</button>
        `}
      </div>
    `;
    bindTagForm(form, (event) => submitTagEdit(event, tag), cancelTagEdit);
    bindUxColorFieldInteractions(form);
    if (isConfirmingDelete) {
      disableTagEditControls(form);
    }
    form.querySelector("[data-sidebar-tag-delete]")?.addEventListener("click", () => {
      state.confirmingSidebarTagDeleteId = tag.id;
      state.sidebarTagError = "";
      renderSidebarTags();
    });
    form.querySelector("[data-sidebar-tag-delete-cancel]")?.addEventListener("click", () => {
      state.confirmingSidebarTagDeleteId = null;
      renderSidebarTags();
    });
    form.querySelector("[data-sidebar-tag-delete-confirm]")?.addEventListener("click", () => deleteTag(tag.id));
    requestAnimationFrame(() => {
      if (isConfirmingDelete) {
        return;
      }
      const input = form.querySelector("[data-sidebar-tag-name]");
      input?.focus();
      input?.select();
    });
    return form;
  }

  function disableTagEditControls(form) {
    form
      .querySelectorAll("[data-sidebar-tag-name], [data-color-enabled-for], [data-field-id='color'], [data-color-picker-for]")
      .forEach((control) => {
        control.disabled = true;
      });
  }

  function renderTagPreviewBadge(tag) {
    return `
      <div class="sidebar-tag-preview" aria-label="Editing tag">
        <span class="sidebar-tag-badge sidebar-tag-preview-badge${tagToneClass(tag)}"${tagBackgroundStyle(tag, ctx.escapeHtml)} title="${ctx.escapeHtml(tag.name)}">
          <span>${ctx.escapeHtml(tag.name)}</span>
        </span>
      </div>
    `;
  }

  function renderTagError() {
    return `<div class="sidebar-tag-form-error danger" data-sidebar-tag-error ${state.sidebarTagError ? "" : "hidden"}>${ctx.escapeHtml(state.sidebarTagError)}</div>`;
  }

  function bindTagForm(root, submitHandler, cancelHandler) {
    const form = root.matches("form") ? root : root.querySelector("form");
    form?.addEventListener("submit", submitHandler);
    form?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      cancelHandler();
    });
    form?.querySelector("[data-sidebar-tag-cancel]")?.addEventListener("click", cancelHandler);
  }

  function startTagEdit(tagId) {
    state.isCreatingSidebarTag = false;
    state.editingSidebarTagId = tagId;
    state.confirmingSidebarTagDeleteId = null;
    state.sidebarTagError = "";
    renderSidebarTags();
  }

  function cancelTagEdit() {
    state.isCreatingSidebarTag = false;
    state.editingSidebarTagId = null;
    state.confirmingSidebarTagDeleteId = null;
    state.sidebarTagError = "";
    renderSidebarTags();
  }

  async function submitTagCreate(input) {
    const name = input?.value.trim() ?? "";
    if (!name) {
      cancelTagEdit();
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}/tags`, {
      method: "POST",
      body: { name, color: "" },
    });
    state.isCreatingSidebarTag = false;
    state.sidebarTagError = "";
    await refreshTagsAfterChange();
    ctx.showToast("Tag created");
  }

  async function submitTagEdit(event, tag) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.querySelector("[data-sidebar-tag-name]")?.value.trim() ?? "";
    const colorInput = form.querySelector("[data-field-id='color'][data-field-type='color']");
    if (!name) {
      state.sidebarTagError = "Tag name is required";
      renderSidebarTags();
      return;
    }
    if (colorInput && !isUxColorNoneSelected(colorInput, form) && !isHexColor(colorInput.value.trim())) {
      state.sidebarTagError = "Color must be a HEX color like #1F6F5F";
      renderSidebarTags();
      return;
    }
    await ctx.sendJson(`/api/tags/${tag.id}`, {
      method: "PATCH",
      body: {
        name,
        color: colorInput ? getUxColorFieldValue(colorInput, form) : tag.color,
      },
    });
    state.editingSidebarTagId = null;
    state.confirmingSidebarTagDeleteId = null;
    state.sidebarTagError = "";
    await refreshTagsAfterChange();
    ctx.showToast("Tag updated");
  }

  async function deleteTag(tagId) {
    await ctx.api(`/api/tags/${tagId}`, { method: "DELETE" });
    state.editingSidebarTagId = null;
    state.confirmingSidebarTagDeleteId = null;
    state.sidebarTagError = "";
    state.editorTagIds = state.editorTagIds.filter((id) => id !== tagId);
    await refreshTagsAfterChange();
    ctx.showToast("Tag deleted");
  }

  async function refreshTagsAfterChange() {
    await ctx.refreshBoardDetail();
    ctx.syncTicketTagOptions();
    renderSidebarTags();
  }

  return {
    createTag,
    renderSidebarTags,
  };
}
