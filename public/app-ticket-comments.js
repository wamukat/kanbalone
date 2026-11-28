import { t } from "./app-i18n.js";
import { icon } from "./icons.js";
import { createTicketCommentRenderers } from "./app-ticket-comment-renderers.js";

export function createTicketCommentsModule(ctx) {
  const { state, elements } = ctx;
  let commentStateTimer = null;
  let isCommentComposerOpen = false;
  let expandedRemoteErrorCommentId = null;
  const commentRenderers = createTicketCommentRenderers(ctx, {
    getExpandedRemoteErrorCommentId: () => expandedRemoteErrorCommentId,
  });
  const { humanizeRemoteSyncError, renderComments } = commentRenderers;
  const isCurrent = () => ctx.isDialogCurrent() && state.dialogMode === "view";
  ctx.imageAttachments.bind(elements.commentBody, isCurrent);

  elements.ticketComments.addEventListener("keydown", event => {
    const confirmation = event.target.closest?.("[data-comment-delete-confirm]");
    if (confirmation && !confirmation.hidden && isCurrent() && ctx.isSaveShortcut(event)) {
      event.preventDefault();
      const button = confirmation.querySelector("[data-confirm-comment-delete-id]");
      if (!event.repeat && button && !button.disabled) button.click();
      return;
    }
    const form = event.target.closest?.("[data-comment-edit-form]");
    if (!form || form.hidden || !isCurrent() || !ctx.isSaveShortcut(event)) return;
    event.preventDefault();
    const button = form.querySelector("[data-save-comment-id]");
    if (!event.repeat && button && !button.disabled) void saveCommentInline(button);
  });

  function inlineInputs() {
    return [...elements.ticketComments.querySelectorAll("[data-comment-edit-body]")];
  }

  function resetImageUploads() {
    ctx.imageAttachments.reset(elements.commentBody);
    for (const input of inlineInputs()) ctx.imageAttachments.reset(input);
  }

  function hasUnsavedComments() {
    if (state.dialogMode !== "view") return false;
    const composer = elements.commentBody;
    if (composer.value.trim()) return true;
    return inlineInputs().some(input => input.readOnly || input.value !== input.defaultValue);
  }

  function isSaving() {
    return elements.commentBody.readOnly || inlineInputs().some(input => input.readOnly);
  }

  function syncComments(comments, { preserveEdits = true } = {}) {
    const list = elements.ticketComments;
    const template = document.createElement("template");
    template.innerHTML = renderComments(comments);
    const active = document.activeElement;
    const drafts = new Map();
    if (preserveEdits) {
      for (const input of inlineInputs()) {
        if (input.closest("form").hidden || input.closest("form").dataset.saved) continue;
        const item = input.closest(".comment-item");
        drafts.set(item.dataset.commentId, item);
      }
    }
    if (drafts.size === 0) {
      for (const input of inlineInputs()) ctx.imageAttachments.reset(input);
      list.replaceChildren(template.content);
      return;
    }
    const desiredItems = [...template.content.children].map((item) =>
      item.querySelector("[data-edit-comment-id]") ? drafts.get(item.dataset.commentId) ?? item : item);
    const retained = new Set(desiredItems);
    for (const oldItem of [...list.children]) {
      if (retained.has(oldItem)) continue;
      ctx.imageAttachments.reset(oldItem.querySelector("[data-comment-edit-body]"));
      oldItem.remove();
    }
    for (const [index, item] of desiredItems.entries()) {
      const currentItem = list.children[index];
      if (item !== currentItem) list.insertBefore(item, currentItem ?? null);
    }
    if (active instanceof HTMLElement && list.contains(active) && document.activeElement !== active) active.focus({ preventScroll: true });
  }

  function syncCommentComposer() {
    if (!elements.commentForm || !elements.commentComposeToggle) {
      return;
    }
    elements.commentForm.hidden = !isCommentComposerOpen;
    elements.commentComposeToggle.setAttribute("aria-expanded", String(isCommentComposerOpen));
    elements.commentComposeToggle.innerHTML = isCommentComposerOpen
      ? `${icon("x")}<span>${t("Hide Comment Form")}</span>`
      : `${icon("plus")}<span>${t("Add Comment")}</span>`;
    ctx.syncDialogScrollLock?.();
  }

  function toggleCommentComposer() {
    isCommentComposerOpen = !isCommentComposerOpen;
    if (!isCommentComposerOpen) {
      clearCommentState();
    }
    syncCommentComposer();
    if (isCommentComposerOpen) {
      queueMicrotask(() => elements.commentBody?.focus());
    }
  }

  function resetCommentComposer() {
    isCommentComposerOpen = false;
    ctx.imageAttachments.reset(elements.commentBody);
    elements.commentBody.value = "";
    elements.commentBody.readOnly = false;
    elements.saveCommentButton.disabled = false;
    clearCommentState();
    syncCommentComposer();
  }

  function discardDrafts() {
    resetCommentComposer();
    syncComments(state.dialogTicket?.comments ?? [], { preserveEdits: false });
  }

  function clearCommentState() {
    if (commentStateTimer) {
      window.clearTimeout(commentStateTimer);
      commentStateTimer = null;
    }
    if (!elements.commentSaveState) {
      return;
    }
    elements.commentSaveState.hidden = true;
    elements.commentSaveState.textContent = "";
    elements.commentSaveState.dataset.kind = "";
  }

  function setCommentState(kind, message) {
    if (!elements.commentSaveState) {
      return;
    }
    if (commentStateTimer) {
      window.clearTimeout(commentStateTimer);
      commentStateTimer = null;
    }
    elements.commentSaveState.hidden = false;
    elements.commentSaveState.dataset.kind = kind;
    elements.commentSaveState.textContent = message;
    if (kind === "saved") {
      commentStateTimer = window.setTimeout(() => {
        if (elements.commentSaveState.dataset.kind === "saved") {
          clearCommentState();
        }
      }, 1400);
    }
  }

  async function addComment(event) {
    event?.preventDefault?.();
    const ticketId = state.editingTicketId;
    if (!ticketId || !isCurrent() || elements.saveCommentButton.disabled || !ctx.imageAttachments.canSave(elements.commentBody)) {
      return;
    }
    const stillCurrent = ctx.captureDialogScope();
    const bodyMarkdown = elements.commentBody.value.trim();
    if (!bodyMarkdown) {
      ctx.showToast(t("Comment is required"), "error");
      return;
    }
    try {
      elements.saveCommentButton.disabled = true;
      elements.commentBody.readOnly = true;
      await ctx.sendJson(`/api/tickets/${ticketId}/comments`, {
        method: "POST",
        body: { bodyMarkdown },
      });
      if (!stillCurrent()) return;
      await ctx.refreshDialogTicket(ticketId);
      if (!stillCurrent()) return;
      ctx.imageAttachments.reset(elements.commentBody);
      elements.commentBody.value = "";
      await ctx.refreshBoardDetail();
      if (stillCurrent()) setCommentState("saved", t("Comment saved"));
    } catch (error) {
      if (stillCurrent()) {
        setCommentState("error", t("Save failed"));
        ctx.showToast(error.message, "error");
      }
    } finally {
      if (stillCurrent()) {
        elements.saveCommentButton.disabled = false;
        elements.commentBody.readOnly = false;
      }
    }
  }

  async function handleCommentAction(event) {
    const toggleButton = event.target.closest("[data-toggle-comment-actions]");
    if (toggleButton) {
      toggleCommentActions(toggleButton);
      return;
    }

    const editButton = event.target.closest("[data-edit-comment-id]");
    if (editButton) {
      editCommentInline(editButton);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-comment-edit]");
    if (cancelButton) {
      cancelCommentInlineEdit(cancelButton);
      return;
    }

    const saveButton = event.target.closest("[data-save-comment-id]");
    if (saveButton) {
      await saveCommentInline(saveButton);
      return;
    }

    const pushButton = event.target.closest("[data-push-comment-id]");
    if (pushButton) {
      await pushCommentRemote(pushButton);
      return;
    }

    const toggleRemoteErrorButton = event.target.closest("[data-toggle-remote-error-details-id]");
    if (toggleRemoteErrorButton) {
      toggleRemoteErrorDetails(Number(toggleRemoteErrorButton.dataset.toggleRemoteErrorDetailsId));
      return;
    }

    const deleteButton = event.target.closest("[data-delete-comment-id]");
    if (deleteButton) {
      startCommentDeleteConfirm(deleteButton);
      return;
    }

    const cancelDeleteButton = event.target.closest("[data-cancel-comment-delete]");
    if (cancelDeleteButton) {
      cancelCommentDeleteConfirm();
      return;
    }

    const confirmDeleteButton = event.target.closest("[data-confirm-comment-delete-id]");
    if (confirmDeleteButton) {
      await deleteComment(Number(confirmDeleteButton.dataset.confirmCommentDeleteId), confirmDeleteButton);
    }
  }

  function toggleCommentActions(toggleButton) {
    const menu = toggleButton.parentElement?.querySelector(".inline-action-menu");
    if (!menu) {
      return;
    }
    const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    state.confirmingCommentDeleteId = null;
    hideCommentDeleteConfirms();
    toggleButton.setAttribute("aria-expanded", String(!isExpanded));
    menu.hidden = false;
    menu.classList.toggle("expanded", !isExpanded);
    menu.toggleAttribute("inert", isExpanded);
    if (isExpanded) {
      window.setTimeout(() => {
        if (!menu.classList.contains("expanded")) {
          menu.hidden = true;
        }
      }, 180);
    }
  }

  function editCommentInline(editButton) {
    const item = editButton.closest(".comment-item");
    if (!item) {
      return;
    }
    const toggleButton = item.querySelector("[data-toggle-comment-actions]");
    const menu = item.querySelector(".inline-action-menu");
    toggleButton?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("expanded");
    menu?.toggleAttribute("inert", true);
    if (menu) {
      menu.hidden = true;
    }
    state.confirmingCommentDeleteId = null;
    hideCommentDeleteConfirms();
    item.querySelector(".comment-display").hidden = true;
    const form = item.querySelector("[data-comment-edit-form]");
    form.hidden = false;
    const input = form.querySelector("[data-comment-edit-body]");
    ctx.imageAttachments.bind(input, isCurrent);
    input.focus();
    ctx.syncDialogScrollLock?.();
  }

  function cancelCommentInlineEdit(cancelButton) {
    const item = cancelButton.closest(".comment-item");
    if (!item) {
      return;
    }
    const form = item.querySelector("[data-comment-edit-form]");
    const textarea = item.querySelector("[data-comment-edit-body]");
    if (textarea) {
      if (textarea.readOnly) return;
      ctx.imageAttachments.reset(textarea);
      textarea.value = textarea.defaultValue;
    }
    form.hidden = true;
    item.querySelector(".comment-display").hidden = false;
    ctx.syncDialogScrollLock?.();
  }

  async function saveCommentInline(saveButton) {
    const item = saveButton.closest(".comment-item");
    const textarea = item?.querySelector("[data-comment-edit-body]");
    if (!isCurrent() || saveButton.disabled || !ctx.imageAttachments.canSave(textarea)) return;
    const ticketId = state.editingTicketId;
    const stillCurrent = ctx.captureDialogScope();
    const bodyMarkdown = textarea?.value.trim() ?? "";
    if (!bodyMarkdown) {
      ctx.showToast(t("Comment is required"), "error");
      return;
    }
    try {
      saveButton.disabled = true;
      textarea.readOnly = true;
      setCommentState("saving", t("Saving..."));
      await ctx.sendJson(`/api/comments/${saveButton.dataset.saveCommentId}`, {
        method: "PATCH",
        body: { bodyMarkdown },
      });
      if (!stillCurrent()) return;
      textarea.closest("form").dataset.saved = "true";
      await ctx.refreshDialogTicket(ticketId);
      if (!stillCurrent()) return;
      await ctx.refreshBoardDetail();
      if (stillCurrent()) setCommentState("saved", t("Saved"));
    } catch (error) {
      if (stillCurrent()) {
        setCommentState("error", t("Save failed"));
        ctx.showToast(error.message, "error");
      }
    } finally {
      saveButton.disabled = false;
      textarea.readOnly = false;
      delete textarea.closest("form").dataset.saved;
    }
  }

  function startCommentDeleteConfirm(deleteButton) {
    const item = deleteButton.closest(".comment-item");
    if (!item) {
      return;
    }
    state.confirmingCommentDeleteId = Number(deleteButton.dataset.deleteCommentId);
    const toggleButton = item.querySelector("[data-toggle-comment-actions]");
    const menu = item.querySelector(".inline-action-menu");
    toggleButton?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("expanded");
    menu?.toggleAttribute("inert", true);
    if (menu) {
      menu.hidden = true;
    }
    syncCommentDeleteConfirms();
    item.querySelector("[data-cancel-comment-delete]")?.focus();
  }

  function cancelCommentDeleteConfirm() {
    state.confirmingCommentDeleteId = null;
    hideCommentDeleteConfirms();
  }

  function syncCommentDeleteConfirms() {
    for (const confirm of elements.ticketComments.querySelectorAll("[data-comment-delete-confirm]")) {
      confirm.hidden = Number(confirm.dataset.commentDeleteConfirm) !== state.confirmingCommentDeleteId;
    }
  }

  function hideCommentDeleteConfirms() {
    for (const confirm of elements.ticketComments.querySelectorAll("[data-comment-delete-confirm]")) {
      confirm.hidden = true;
    }
  }

  async function deleteComment(commentId, deleteButton) {
    try {
      deleteButton.disabled = true;
      setCommentState("saving", t("Deleting..."));
      await ctx.api(`/api/comments/${commentId}`, { method: "DELETE" });
      state.confirmingCommentDeleteId = null;
      await ctx.refreshDialogTicket();
      await ctx.refreshBoardDetail();
      setCommentState("saved", t("Deleted"));
    } catch (error) {
      setCommentState("error", t("Delete failed"));
      ctx.showToast(error.message, "error");
    } finally {
      deleteButton.disabled = false;
    }
  }

  async function pushCommentRemote(pushButton) {
    const commentId = Number(pushButton.dataset.pushCommentId);
    if (!Number.isInteger(commentId)) {
      return;
    }
    try {
      pushButton.disabled = true;
      setCommentState("saving", t("Pushing to remote..."));
      await ctx.api(`/api/comments/${commentId}/push-remote`, { method: "POST" });
      await ctx.refreshDialogTicket();
      await ctx.refreshBoardDetail();
      expandedRemoteErrorCommentId = null;
      setCommentState("saved", t("Pushed to remote"));
    } catch (error) {
      await ctx.refreshDialogTicket().catch(() => null);
      await ctx.refreshBoardDetail().catch(() => null);
      setCommentState("error", t("Push failed"));
      ctx.showToast(humanizeRemoteSyncError(error.message), "error");
    } finally {
      pushButton.disabled = false;
    }
  }

  function toggleRemoteErrorDetails(commentId) {
    if (!Number.isInteger(commentId)) {
      return;
    }
    expandedRemoteErrorCommentId = expandedRemoteErrorCommentId === commentId ? null : commentId;
    syncComments(state.dialogTicket?.comments ?? []);
  }

  return {
    addComment,
    clearCommentState,
    discardDrafts,
    handleCommentAction,
    hasUnsavedComments,
    isSaving,
    syncComments,
    resetImageUploads,
    resetCommentComposer,
    toggleCommentComposer,
  };
}
