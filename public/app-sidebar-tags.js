import { t as tr } from "./app-i18n.js";
import { tagBackgroundStyle, tagTextColor, tagToneClass } from "./app-tags.js";
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
  const { sidebarTagSection, sidebarTagList, manageSidebarTagsButton, sidebarTagManageHint } = elements;
  let renderedBoardId = null;
  let managing = false;

  function editingMode() {
    return managing || state.viewMode === "group";
  }

  function syncControls() {
    const group = state.viewMode === "group";
    if (group) managing = false;
    manageSidebarTagsButton.hidden = group;
    manageSidebarTagsButton.setAttribute("aria-pressed", String(managing));
    sidebarTagManageHint.hidden = !managing;

    for (const button of sidebarTagList.querySelectorAll("button[data-sidebar-tag-id]")) {
      const label = tr(editingMode() ? "Edit tag: {name}" : "Filter by tag: {name}", {
        name: button.dataset.sidebarTagName,
      });
      button.title = label;
      button.setAttribute("aria-label", label);
      if (editingMode()) {
        button.removeAttribute("aria-pressed");
      } else {
        button.setAttribute("aria-pressed", String(state.filters.tagIds.includes(Number(button.dataset.sidebarTagId))));
      }
      button.querySelector("[data-group-tag-edit]").hidden = !group;
    }
  }

  function createTag() {
    if (!state.activeBoardId || renderedBoardId !== state.activeBoardId) return;
    clearForm();
    state.isCreatingSidebarTag = true;
    renderSidebarTags();
  }

  function renderSidebarTags() {
    const detail = state.boardDetail;
    const boardId = detail?.board.id ?? null;
    if (renderedBoardId !== boardId) {
      renderedBoardId = boardId;
      managing = false;
      clearForm();
      sidebarTagList.replaceChildren();
    }
    const tags = detail?.tags ?? [];
    const tagIds = new Set(tags.map(tag => tag.id));
    const active = sidebarTagList.contains(document.activeElement) ? document.activeElement : null;
    const removedEditedTag = state.editingSidebarTagId !== null && !tagIds.has(state.editingSidebarTagId);
    if (removedEditedTag) clearForm();

    const previousRows = new Map([...sidebarTagList.children].map(row => [row.dataset.sidebarTagRow, row]));
    const rows = [];
    if (state.isCreatingSidebarTag) rows.push(previousRows.get("create") ?? createTagCreateRow());
    if (!tags.length && !state.isCreatingSidebarTag) {
      const empty = previousRows.get("empty") ?? document.createElement("p");
      empty.dataset.sidebarTagRow = "empty";
      empty.className = "tag-manager-empty muted";
      empty.textContent = tr("No tags yet.");
      rows.push(empty);
    }
    for (const tag of tags) {
      const key = String(tag.id);
      const row = previousRows.get(key) ?? document.createElement("div");
      row.className = "sidebar-tag-row";
      row.dataset.sidebarTagRow = key;
      if (state.editingSidebarTagId === tag.id) {
        // Keep the live form mounted across board refreshes so its draft,
        // focus and delete confirmation survive incoming updates.
        if (!row.querySelector("form")) row.replaceChildren(createTagEditForm(tag));
      } else {
        const signature = JSON.stringify([tag.name, tag.color]);
        if (row.dataset.tagSignature !== signature || !row.querySelector("button[data-sidebar-tag-id]")) {
          row.replaceChildren(createTagBadge(tag));
          row.dataset.tagSignature = signature;
        }
      }
      rows.push(row);
    }
    const kept = new Set(rows);
    for (const row of [...sidebarTagList.children]) {
      if (!kept.has(row)) row.remove();
    }
    // Insert siblings around the open form instead of moving it when a tag
    // changes position in the server's name-sorted list.
    const formRow = sidebarTagList.querySelector("form")?.closest("[data-sidebar-tag-row]");
    let next = sidebarTagList.firstElementChild;
    for (const row of rows) {
      if (row === formRow) {
        next = row.nextElementSibling;
      } else if (row === next) {
        next = next.nextElementSibling;
      } else {
        sidebarTagList.insertBefore(row, next);
      }
    }
    syncControls();
    if (active && !active.isConnected) {
      if (removedEditedTag) focusBadge(null);
      else if (active.matches("button[data-sidebar-tag-id]")
        && Number(active.dataset.sidebarTagId) !== state.editingSidebarTagId) {
        focusBadge(Number(active.dataset.sidebarTagId));
      }
    }
  }

  function createTagBadge(tag) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sidebar-tag-badge${tagToneClass(tag)}`;
    button.dataset.sidebarTagId = String(tag.id);
    button.dataset.sidebarTagName = tag.name;
    if (tag.color) {
      button.style.background = tag.color;
      button.style.color = tagTextColor(tag.color);
    }
    button.innerHTML = `
      <span>${ctx.escapeHtml(tag.name)}</span>
      <span data-tag-selected aria-hidden="true">${icon("check")}</span>
      <span data-group-tag-edit aria-hidden="true" hidden>${icon("pencil")}</span>
    `;
    button.addEventListener("click", () => {
      if (renderedBoardId !== state.activeBoardId) return;
      if (editingMode()) startTagEdit(tag.id);
      else ctx.toggleTagFilter(tag.id);
    });
    return button;
  }

  function createTagCreateRow() {
    const form = createInlineTextForm({
      className: "sidebar-tag-row sidebar-tag-create-row",
      html: `<input id="sidebar-tag-create-input" data-sidebar-tag-name type="text" placeholder="${tr("Tag name")}" aria-label="${tr("Tag name")}" autocomplete="off" />`,
      inputSelector: "[data-sidebar-tag-name]",
      onSubmit: input => submitTagCreate(form, input),
      onCancel: () => {
        if (form.isConnected) cancelTagEdit({ restoreFocus: form.contains(document.activeElement) });
      },
      cancelOnFocusOut: "always",
    });
    form.dataset.sidebarTagRow = "create";
    form.dataset.sidebarTagCreateForm = "";
    return form;
  }

  function createTagEditForm(tag) {
    const form = document.createElement("form");
    form.className = "sidebar-tag-form ux-fields";
    form.dataset.sidebarTagEditForm = String(tag.id);
    form.innerHTML = `
      ${renderTagPreviewBadge(tag)}
      <input id="sidebar-tag-name-${tag.id}" data-sidebar-tag-name type="text" value="${ctx.escapeHtml(tag.name)}" aria-label="${tr("Tag name")}" autocomplete="off" required />
      ${renderUxColorField({
        id: "color",
        label: tr("Color"),
        value: tag.color || "#1f6f5f",
        required: true,
        type: "color",
        allowNone: true,
        enabled: Boolean(tag.color),
      }, ctx.escapeHtml)}
      <div class="sidebar-tag-form-error danger" data-sidebar-tag-error role="alert" hidden></div>
      <div class="sidebar-tag-form-actions sidebar-tag-form-actions-split" data-sidebar-tag-actions>
        <button type="button" class="danger icon-button" data-sidebar-tag-delete title="${tr("Delete tag")}" aria-label="${tr("Delete tag")}">${icon("trash-2")}</button>
        <span class="sidebar-tag-action-spacer"></span>
        <button type="button" class="ghost" data-sidebar-tag-cancel>${tr("Cancel")}</button>
        <button type="submit" class="primary-action">${tr("Save")}</button>
      </div>
      <div class="sidebar-tag-delete-confirm" hidden>
        <span>${tr("Delete this tag?")}</span>
        <div class="sidebar-tag-delete-confirm-actions">
          <button type="button" class="ghost" data-sidebar-tag-delete-cancel>${tr("Cancel")}</button>
          <button type="button" class="danger action-with-icon danger-confirm-action" data-sidebar-tag-delete-confirm>${icon("trash-2")}<span>${tr("Delete")}</span></button>
        </div>
      </div>
    `;
    form.addEventListener("submit", event => submitTagEdit(event, tag));
    bindUxColorFieldInteractions(form);
    form.querySelector("[data-sidebar-tag-cancel]").addEventListener("click", () => cancelTagEdit());
    form.querySelector("[data-sidebar-tag-delete]").addEventListener("click", () => setDeleteConfirmation(form, true));
    form.querySelector("[data-sidebar-tag-delete-cancel]").addEventListener("click", () => setDeleteConfirmation(form, false));
    form.querySelector("[data-sidebar-tag-delete-confirm]").addEventListener("click", () => deleteTag(form, tag.id));
    requestAnimationFrame(() => {
      const input = form.querySelector("[data-sidebar-tag-name]");
      input.focus();
      input.select();
    });
    return form;
  }

  function setDeleteConfirmation(form, confirming) {
    form.querySelector("[data-sidebar-tag-actions]").hidden = confirming;
    form.querySelector(".sidebar-tag-delete-confirm").hidden = !confirming;
    const colorEnabled = form.querySelector("[data-color-enabled-for]").checked;
    form.querySelector("[data-sidebar-tag-name]").disabled = confirming;
    form.querySelector("[data-color-enabled-for]").disabled = confirming;
    for (const control of form.querySelectorAll("[data-field-id='color'], [data-color-picker-for]")) {
      control.disabled = confirming || !colorEnabled;
    }
    setFormError(form, "");
    form.querySelector(confirming ? "[data-sidebar-tag-delete-cancel]" : "[data-sidebar-tag-delete]").focus();
  }

  function renderTagPreviewBadge(tag) {
    return `
      <div class="sidebar-tag-preview" aria-label="${tr("Editing tag")}">
        <span class="sidebar-tag-badge sidebar-tag-preview-badge${tagToneClass(tag)}"${tagBackgroundStyle(tag, ctx.escapeHtml)} title="${ctx.escapeHtml(tag.name)}">
          <span>${ctx.escapeHtml(tag.name)}</span>
        </span>
      </div>
    `;
  }

  function setFormError(form, message) {
    const error = form.querySelector("[data-sidebar-tag-error]");
    error.textContent = message;
    error.hidden = !message;
  }

  function startTagEdit(tagId) {
    clearForm();
    state.editingSidebarTagId = tagId;
    renderSidebarTags();
  }

  function clearForm() {
    state.isCreatingSidebarTag = false;
    state.editingSidebarTagId = null;
  }

  function focusBadge(tagId) {
    const badge = sidebarTagList.querySelector(`button[data-sidebar-tag-id="${tagId}"]`);
    (badge ?? (manageSidebarTagsButton.hidden ? elements.newSidebarTagButton : manageSidebarTagsButton))
      .focus({ preventScroll: true });
  }

  function cancelTagEdit({ restoreFocus = true } = {}) {
    const tagId = state.editingSidebarTagId;
    const creating = state.isCreatingSidebarTag;
    clearForm();
    renderSidebarTags();
    if (!restoreFocus) return;
    if (creating) elements.newSidebarTagButton.focus({ preventScroll: true });
    else focusBadge(tagId);
  }

  function setManagement(enabled) {
    managing = enabled;
    if (!enabled) clearForm();
    renderSidebarTags();
    manageSidebarTagsButton.focus({ preventScroll: true });
  }

  async function changeTag(form, request, successMessage, tagId = state.editingSidebarTagId) {
    const boardId = state.activeBoardId;
    if (form.dataset.saving || !form.isConnected || renderedBoardId !== boardId) return;
    const currentBoard = () => boardId === state.activeBoardId && !elements.shell.classList.contains("custom-view-active");
    const currentForm = () => form.isConnected && currentBoard();
    form.dataset.saving = "true";
    try {
      await request();
      const restoreFocus = currentForm() && form.contains(document.activeElement);
      if (currentForm()) {
        clearForm();
        renderSidebarTags();
      }
      if (!currentBoard()) return;
      await ctx.refreshBoardDetail();
      if (!currentBoard()) return;
      ctx.syncTicketTagOptions();
      if (restoreFocus && document.activeElement === document.body) {
        if (tagId === null) elements.newSidebarTagButton.focus({ preventScroll: true });
        else focusBadge(tagId);
      }
      ctx.showToast(tr(successMessage));
    } catch (error) {
      if (currentBoard()) ctx.showToast(error.message, "error");
    } finally {
      delete form.dataset.saving;
    }
  }

  async function submitTagCreate(form, input) {
    const name = input?.value.trim() ?? "";
    if (!name) {
      cancelTagEdit();
      return;
    }
    const boardId = state.activeBoardId;
    await changeTag(form, () => ctx.sendJson(`/api/boards/${boardId}/tags`, {
      method: "POST",
      body: { name, color: "" },
    }), "Tag created");
  }

  async function submitTagEdit(event, tag) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.querySelector(".sidebar-tag-delete-confirm").hidden) return;
    const name = form.querySelector("[data-sidebar-tag-name]")?.value.trim() ?? "";
    const colorInput = form.querySelector("[data-field-id='color'][data-field-type='color']");
    if (!name) {
      setFormError(form, tr("Tag name is required"));
      return;
    }
    if (colorInput && !isUxColorNoneSelected(colorInput, form) && !isHexColor(colorInput.value.trim())) {
      setFormError(form, tr("Color must be a HEX color like #1F6F5F"));
      return;
    }
    await changeTag(form, () => ctx.sendJson(`/api/tags/${tag.id}`, {
      method: "PATCH",
      body: { name, color: colorInput ? getUxColorFieldValue(colorInput, form) : tag.color },
    }), "Tag updated");
  }

  async function deleteTag(form, tagId) {
    await changeTag(form, () => ctx.api(`/api/tags/${tagId}`, { method: "DELETE" }), "Tag deleted");
  }

  manageSidebarTagsButton.addEventListener("click", () => setManagement(!managing));
  sidebarTagSection.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (state.editingSidebarTagId !== null) cancelTagEdit();
    else if (managing) setManagement(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });

  return { createTag, renderSidebarTags, syncControls };
}
